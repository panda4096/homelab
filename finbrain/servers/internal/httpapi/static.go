package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

// mountStatic serves a built frontend from cfg.StaticDir with SPA history
// fallback (unknown non-API paths return index.html). Optional — dev uses the
// Vite dev server instead.
func (s *Server) mountStatic(r chi.Router) {
	dir := s.cfg.StaticDir
	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		if strings.HasPrefix(req.URL.Path, "/api/") || req.URL.Path == "/healthz" {
			http.NotFound(w, req)
			return
		}
		p := filepath.Join(dir, filepath.Clean(req.URL.Path))
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			http.ServeFile(w, req, p)
			return
		}
		http.ServeFile(w, req, filepath.Join(dir, "index.html"))
	})
}
