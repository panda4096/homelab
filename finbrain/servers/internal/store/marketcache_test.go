package store

import (
	"fmt"
	"testing"
	"time"
)

// TestMarketCacheEvictsToBound proves cache memory is a fixed LRU ceiling: when the total
// price-bar count exceeds maxBars, the least-recently-used symbols are evicted until under
// it, and the bar accounting stays consistent. No TTL/idle eviction involved. No DB needed.
func TestMarketCacheEvictsToBound(t *testing.T) {
	c := newMarketCache(nil, time.Minute, 100) // cap = 100 bars
	now := time.Now()

	// 6 entries × 40 bars = 240 bars (> cap 100), each with a distinct recency.
	// S0 is least-recently-used, S5 most-recently-used.
	for i := 0; i < 6; i++ {
		c.prices[fmt.Sprintf("S%d", i)] = &priceEntry{
			loadedAt:   now,
			lastAccess: now.Add(time.Duration(i) * time.Second),
			bars:       make([]priceBar, 40),
		}
		c.totalPriceBars += 40
	}

	c.evictLocked()

	if c.totalPriceBars > c.maxBars {
		t.Errorf("cache over cap after eviction: %d bars > max %d", c.totalPriceBars, c.maxBars)
	}
	if c.totalPriceBars != countBars(c) {
		t.Errorf("totalPriceBars accounting drifted: tracked %d, actual %d", c.totalPriceBars, countBars(c))
	}
	// LRU order: the most-recently-used survive, the least-recently-used go first.
	if _, ok := c.prices["S5"]; !ok {
		t.Error("most-recently-used entry S5 was evicted")
	}
	if _, ok := c.prices["S0"]; ok {
		t.Error("least-recently-used entry S0 should have been evicted first")
	}
}

func countBars(c *marketCache) int {
	n := 0
	for _, e := range c.prices {
		n += len(e.bars)
	}
	return n
}
