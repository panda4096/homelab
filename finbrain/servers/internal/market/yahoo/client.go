// Package yahoo is a small, key-less HTTP client for Yahoo Finance's public v8 chart
// endpoint: daily split-adjusted closes for US/HK equities, indices, and FX pairs.
//
// Yahoo is an OVERSEAS source (the opposite of Eastmoney): it is reachable from a non-China
// exit and is NOT subject to push2his.eastmoney.com's per-IP bans. By default the client honours
// HTTP_PROXY/HTTPS_PROXY (http.ProxyFromEnvironment) so a local mihomo/clash exit routes it
// abroad; on an overseas host it goes direct. FINBRAIN_MARKETDATA_YAHOO_PROXY pins an explicit
// proxy when env-based routing isn't available.
//
// The v8 chart `close` series is already SPLIT-adjusted (but not dividend-adjusted), which is
// exactly what valuation needs: the latest bar is the real current price and pre-split history
// is scaled so a constant share count stays continuous — equivalent to Eastmoney's 前复权 (qfq),
// with no fqt parameter required.
package yahoo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

// minGap paces outbound requests. Yahoo rate-limits per exit IP (HTTP 429) — and a shared
// proxy exit hits that ceiling faster — so all callers funnel through one paced client.
const minGap = 400 * time.Millisecond

// hosts are tried round-robin across retries; a 429 is sometimes per-host.
var hosts = []string{"query1.finance.yahoo.com", "query2.finance.yahoo.com"}

// Client talks to Yahoo Finance's public chart host. Safe for concurrent use; requests are
// globally paced and serialized.
type Client struct {
	http *http.Client

	gateMu sync.Mutex // serializes + paces all outbound requests
	last   time.Time
}

// New builds a client. proxy is an explicit override; when empty the client uses the
// environment proxy (http.ProxyFromEnvironment), which is the right default for Yahoo: a
// local mihomo/clash exit routes it overseas, an overseas host goes direct.
func New(proxy string) *Client {
	transport := &http.Transport{Proxy: http.ProxyFromEnvironment}
	if p := strings.TrimSpace(proxy); p != "" {
		if u, err := url.Parse(p); err == nil {
			transport.Proxy = http.ProxyURL(u)
		}
	}
	return &Client{http: &http.Client{Transport: transport, Timeout: 20 * time.Second}}
}

// Bar is one daily data point: an ISO date and a decimal close, both as strings so they flow
// into the decimal-string store without float rounding.
type Bar struct {
	Date  string
	Close string
}

// DailyCloses returns daily split-adjusted close bars for a Yahoo symbol (e.g. "AAPL",
// "0700.HK", "^HSI", "USDCNY=X"). beg controls the range: "" fetches only the most recent few
// bars (latest close); a "YYYYMMDD" date fetches history from that day; "0" fetches the entire
// available history.
func (c *Client) DailyCloses(ctx context.Context, symbol, beg string) ([]Bar, error) {
	_, bars, err := c.dailyCloses(ctx, symbol, beg)
	return bars, err
}

// DailyClosesNamed is DailyCloses plus the instrument's display name (meta.shortName) — used by
// the resolve/validation probe to auto-fill the name without a second request.
func (c *Client) DailyClosesNamed(ctx context.Context, symbol, beg string) (string, []Bar, error) {
	return c.dailyCloses(ctx, symbol, beg)
}

func (c *Client) dailyCloses(ctx context.Context, symbol, beg string) (string, []Bar, error) {
	q := url.Values{}
	q.Set("interval", "1d")
	q.Set("includePrePost", "false")
	if beg == "" {
		q.Set("range", "5d") // latest few bars
	} else {
		var p1 int64
		if beg != "0" {
			t, err := time.Parse("20060102", beg)
			if err != nil {
				return "", nil, fmt.Errorf("yahoo: bad beg %q: %w", beg, err)
			}
			p1 = t.Unix()
		}
		q.Set("period1", strconv.FormatInt(p1, 10))
		q.Set("period2", strconv.FormatInt(time.Now().Add(48*time.Hour).Unix(), 10)) // include today; Yahoo clamps
	}
	body, err := c.get(ctx, "/v8/finance/chart/"+url.PathEscape(symbol)+"?"+q.Encode())
	if err != nil {
		return "", nil, err
	}
	return parseChart(body)
}

type chartResp struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Currency  string `json:"currency"`
				ShortName string `json:"shortName"`
				LongName  string `json:"longName"`
				GMTOffset int64  `json:"gmtoffset"`
			} `json:"meta"`
			Timestamp  []int64 `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					Close []*float64 `json:"close"`
				} `json:"quote"`
			} `json:"indicators"`
		} `json:"result"`
		Error *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"chart"`
}

// parseChart extracts the display name and the (non-null, positive) daily closes from a v8
// chart response. The date is the exchange-local trading date: Yahoo timestamps are UTC, so
// meta.gmtoffset is applied before formatting. Kept as a pure function for unit testing.
func parseChart(body []byte) (string, []Bar, error) {
	var cr chartResp
	if err := json.Unmarshal(body, &cr); err != nil {
		return "", nil, fmt.Errorf("yahoo: %w", err)
	}
	if cr.Chart.Error != nil {
		msg := cr.Chart.Error.Description
		if msg == "" {
			msg = cr.Chart.Error.Code
		}
		return "", nil, fmt.Errorf("yahoo: %s", msg)
	}
	if len(cr.Chart.Result) == 0 {
		return "", nil, errors.New("yahoo: empty result (bad symbol?)")
	}
	r := cr.Chart.Result[0]
	name := r.Meta.ShortName
	if name == "" {
		name = r.Meta.LongName
	}
	if len(r.Indicators.Quote) == 0 {
		return name, nil, nil
	}
	closes := r.Indicators.Quote[0].Close
	bars := make([]Bar, 0, len(r.Timestamp))
	for i, ts := range r.Timestamp {
		if i >= len(closes) || closes[i] == nil {
			continue // Yahoo emits null for non-trading gaps / an in-progress bar
		}
		c := *closes[i]
		if c <= 0 {
			continue
		}
		date := time.Unix(ts+r.Meta.GMTOffset, 0).UTC().Format("2006-01-02")
		bars = append(bars, Bar{Date: date, Close: strconv.FormatFloat(c, 'f', 6, 64)})
	}
	return name, bars, nil
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

// get fetches path (host-relative) with browser-like headers, rotating hosts and backing off
// on a retryable failure (429 / 5xx / transport reset). A 404 is returned as a normal body so
// parseChart can surface Yahoo's "bad symbol" error.
func (c *Client) get(ctx context.Context, path string) ([]byte, error) {
	const attempts = 3
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * 800 * time.Millisecond):
			}
		}
		if err := c.pace(ctx); err != nil {
			return nil, err
		}
		host := hosts[attempt%len(hosts)]
		body, retryable, err := c.doGet(ctx, "https://"+host+path)
		if err == nil {
			return body, nil
		}
		lastErr = err
		if !retryable {
			return nil, err
		}
	}
	return nil, lastErr
}

func (c *Client) doGet(ctx context.Context, rawURL string) ([]byte, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, true, err // transport reset / timeout → retryable
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, true, err
	}
	switch {
	case resp.StatusCode == http.StatusOK:
		return body, false, nil
	case resp.StatusCode == http.StatusNotFound:
		return body, false, nil // bad symbol — parseChart reads chart.error from the body
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return nil, true, fmt.Errorf("yahoo: http %d", resp.StatusCode)
	default:
		return nil, false, fmt.Errorf("yahoo: http %d", resp.StatusCode)
	}
}
