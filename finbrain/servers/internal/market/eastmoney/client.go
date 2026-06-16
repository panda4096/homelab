// Package eastmoney is a small, key-less HTTP client for Eastmoney (东方财富) public
// market-data endpoints: daily K-line for US/HK equities & FX, and open-end fund NAV.
// All endpoints are reachable from mainland China without a proxy; a proxy can still be
// supplied for environments where the domains are blocked.
package eastmoney

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

// minGap is the minimum spacing between any two upstream requests. Eastmoney resets
// connections (EOF) under bursts, so ALL callers (refresh, backfill, per-instrument
// triggers) funnel through one client and are globally paced and serialized here.
const minGap = 350 * time.Millisecond

// Client talks to Eastmoney's public quote/fund hosts. Safe for concurrent use; requests
// are globally rate-limited.
type Client struct {
	http *http.Client

	gateMu sync.Mutex // serializes + paces all outbound requests
	last   time.Time
}

// New builds a client. Eastmoney is a DOMESTIC (China) data source, so by default this
// client connects DIRECTLY and explicitly does NOT use any proxy: Proxy is pinned to nil
// so HTTP_PROXY/HTTPS_PROXY in the environment are ignored and requests never go through
// the host's mihomo mixed-port (:7890). On the NUC, mihomo's TUN already routes these
// domains direct via its GEOSITE,cn / GEOIP,CN rules; routing a domestic site through a
// foreign proxy exit is exactly what breaks it. The proxy arg is an escape hatch (set
// FINBRAIN_MARKETDATA_PROXY) only if a non-China source is ever added.
func New(proxy string) *Client {
	transport := &http.Transport{
		Proxy: nil, // explicit: never use a proxy for domestic Eastmoney (ignore env proxy)
	}
	if p := strings.TrimSpace(proxy); p != "" {
		if u, err := url.Parse(p); err == nil {
			transport.Proxy = http.ProxyURL(u)
		}
	}
	return &Client{http: &http.Client{Transport: transport, Timeout: 20 * time.Second}}
}

// pace blocks until at least minGap has elapsed since the previous request. Holding gateMu
// across the wait means concurrent callers queue, so the upstream is never hit in bursts.
func (c *Client) pace(ctx context.Context) error {
	c.gateMu.Lock()
	defer c.gateMu.Unlock()
	if !c.last.IsZero() {
		if wait := minGap - time.Since(c.last); wait > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(wait):
			}
		}
	}
	c.last = time.Now()
	return nil
}

// Bar is one daily data point: an ISO date and a decimal close, both as strings so
// they flow into the decimal-string store without float rounding.
type Bar struct {
	Date  string
	Close string
}

// get fetches rawURL with the browser-like headers Eastmoney requires, retrying a few
// times on transient failures (the hosts reset connections — EOF — when hit too fast).
func (c *Client) get(ctx context.Context, rawURL, referer string) ([]byte, error) {
	const attempts = 3
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * 600 * time.Millisecond):
			}
		}
		if err := c.pace(ctx); err != nil {
			return nil, err
		}
		body, err := c.doGet(ctx, rawURL, referer)
		if err == nil {
			return body, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

func (c *Client) doGet(ctx context.Context, rawURL, referer string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("eastmoney %s: http %d", rawURL, resp.StatusCode)
	}
	return body, nil
}

type klineResp struct {
	Data *struct {
		Code   string   `json:"code"`
		Klines []string `json:"klines"`
	} `json:"data"`
}

// DailyKline returns daily bars for a secid (e.g. "105.AAPL", "116.00700", "120.USDCNYC").
// beg controls the range: "" fetches only the most recent few bars (latest bar reflects
// the live price during an open session); a "YYYYMMDD" date fetches history from that day;
// "0" fetches the entire available history. Bounding beg keeps backfill responses small,
// which is both faster and less likely to trip Eastmoney's throttle. fqt is the adjustment
// mode: 0=raw, 1=forward-adjusted, 2=back-adjusted.
func (c *Client) DailyKline(ctx context.Context, secid string, fqt int, beg string) ([]Bar, error) {
	q := url.Values{}
	q.Set("secid", secid)
	q.Set("klt", "101") // daily
	q.Set("fqt", fmt.Sprintf("%d", fqt))
	q.Set("end", "20500101")
	q.Set("fields1", "f1")
	q.Set("fields2", "f51,f52,f53,f54,f55,f56") // date,open,close,high,low,volume
	if beg != "" {
		q.Set("beg", beg)
	} else {
		q.Set("lmt", "3")
	}
	body, err := c.get(ctx, "https://push2his.eastmoney.com/api/qt/stock/kline/get?"+q.Encode(), "https://quote.eastmoney.com/")
	if err != nil {
		return nil, err
	}
	var kr klineResp
	if err := json.Unmarshal(body, &kr); err != nil {
		return nil, fmt.Errorf("eastmoney kline %s: %w", secid, err)
	}
	if kr.Data == nil {
		return nil, fmt.Errorf("eastmoney kline %s: no data (bad secid?)", secid)
	}
	out := make([]Bar, 0, len(kr.Data.Klines))
	for _, line := range kr.Data.Klines {
		parts := strings.Split(line, ",")
		if len(parts) < 3 {
			continue
		}
		out = append(out, Bar{Date: parts[0], Close: parts[2]}) // f51=date, f53=close
	}
	return out, nil
}

type lsjzResp struct {
	Data struct {
		LSJZList []struct {
			FSRQ string `json:"FSRQ"` // NAV date
			DWJZ string `json:"DWJZ"` // unit NAV
		} `json:"LSJZList"`
	} `json:"Data"`
	TotalCount int `json:"TotalCount"`
}

// FundNavHistory returns the full daily unit-NAV (单位净值) history for an open-end fund,
// paging through Eastmoney's f10/lsjz endpoint. Bar.Close holds the unit NAV.
func (c *Client) FundNavHistory(ctx context.Context, fundCode string) ([]Bar, error) {
	const pageSize = 200
	var out []Bar
	for page := 1; page <= 200; page++ { // hard cap ~40k rows
		q := url.Values{}
		q.Set("fundCode", fundCode)
		q.Set("pageIndex", fmt.Sprintf("%d", page))
		q.Set("pageSize", fmt.Sprintf("%d", pageSize))
		body, err := c.get(ctx, "https://api.fund.eastmoney.com/f10/lsjz?"+q.Encode(), "https://fundf10.eastmoney.com/")
		if err != nil {
			return nil, err
		}
		var lr lsjzResp
		if err := json.Unmarshal(body, &lr); err != nil {
			return nil, fmt.Errorf("eastmoney lsjz %s: %w", fundCode, err)
		}
		if len(lr.Data.LSJZList) == 0 {
			break
		}
		for _, row := range lr.Data.LSJZList {
			if row.FSRQ == "" || row.DWJZ == "" {
				continue
			}
			out = append(out, Bar{Date: row.FSRQ, Close: row.DWJZ})
		}
		if len(out) >= lr.TotalCount || len(lr.Data.LSJZList) < pageSize {
			break
		}
	}
	return out, nil
}

var fundgzRe = regexp.MustCompile(`jsonpgz\((\{.*?\})\);?`)

// FundEstimate is the intraday estimated NAV plus the latest officially published NAV.
type FundEstimate struct {
	OfficialDate string // jzrq: date of the last published unit NAV
	OfficialNav  string // dwjz
	EstDate      string // date portion of gztime (the estimate's day)
	EstNav       string // gsz: intraday estimated NAV
}

// FundEstimate fetches the realtime estimated NAV (fundgz). Used to fill "today's"
// value before the official NAV is published (funds settle T+1, QDII often T+2).
func (c *Client) FundEstimate(ctx context.Context, fundCode string) (FundEstimate, error) {
	body, err := c.get(ctx, "https://fundgz.1234567.com.cn/js/"+url.PathEscape(fundCode)+".js", "https://fund.eastmoney.com/")
	if err != nil {
		return FundEstimate{}, err
	}
	m := fundgzRe.FindSubmatch(body)
	if m == nil {
		return FundEstimate{}, fmt.Errorf("eastmoney fundgz %s: unexpected body", fundCode)
	}
	var raw struct {
		JZRQ   string `json:"jzrq"`
		DWJZ   string `json:"dwjz"`
		GSZ    string `json:"gsz"`
		GZTime string `json:"gztime"`
	}
	if err := json.Unmarshal(m[1], &raw); err != nil {
		return FundEstimate{}, fmt.Errorf("eastmoney fundgz %s: %w", fundCode, err)
	}
	est := FundEstimate{OfficialDate: raw.JZRQ, OfficialNav: raw.DWJZ, EstNav: raw.GSZ}
	if len(raw.GZTime) >= 10 {
		est.EstDate = raw.GZTime[:10] // "2006-01-02 15:04" -> "2006-01-02"
	}
	return est, nil
}

type suggestResp struct {
	QuotationCodeTable struct {
		Data []struct {
			Code     string `json:"Code"`
			QuoteID  string `json:"QuoteID"`
			Classify string `json:"Classify"`
			MktNum   string `json:"MktNum"`
		} `json:"Data"`
	} `json:"QuotationCodeTable"`
}

// ResolveUSSecid maps a US ticker (e.g. "AAPL") to its Eastmoney secid (e.g. "105.AAPL"),
// since the exchange market number (105 NASDAQ / 106 NYSE / 107 AMEX) is not derivable
// from the ticker alone.
func (c *Client) ResolveUSSecid(ctx context.Context, ticker string) (string, error) {
	q := url.Values{}
	q.Set("input", ticker)
	q.Set("type", "14")
	q.Set("count", "8")
	body, err := c.get(ctx, "https://searchadapter.eastmoney.com/api/suggest/get?"+q.Encode(), "https://www.eastmoney.com/")
	if err != nil {
		return "", err
	}
	var sr suggestResp
	if err := json.Unmarshal(body, &sr); err != nil {
		return "", fmt.Errorf("eastmoney suggest %s: %w", ticker, err)
	}
	want := strings.ToUpper(strings.TrimSpace(ticker))
	for _, d := range sr.QuotationCodeTable.Data {
		if strings.EqualFold(d.Code, want) && d.Classify == "UsStock" && d.QuoteID != "" {
			return d.QuoteID, nil
		}
	}
	return "", fmt.Errorf("eastmoney suggest %s: no US match", ticker)
}
