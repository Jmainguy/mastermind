package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	iofs "io/fs"
	"log"
	"math/big"
	"net/http"
	"path"
	"sync"
	"time"
)

type Game struct {
	Secret       []int `json:"-"`
	AttemptsMax  int   `json:"attemptsMax"`
	AttemptsLeft int   `json:"attemptsLeft"`
	CodeLength   int   `json:"codeLength"`
	Colors       int   `json:"colors"`
}

type NewGameRequest struct {
	CodeLength int `json:"codeLength"`
	Colors     int `json:"colors"`
	Attempts   int `json:"attempts"`
}

type NewGameResponse struct {
	ID string `json:"id"`
	Game
}

type GuessRequest struct {
	ID    string `json:"id"`
	Guess []int  `json:"guess"`
}

type GuessResponse struct {
	Exact        int   `json:"exact"`
	Partial      int   `json:"partial"`
	AttemptsLeft int   `json:"attemptsLeft"`
	Won          bool  `json:"won"`
	Lost         bool  `json:"lost"`
	Secret       []int `json:"secret,omitempty"`
}

var (
	games = map[string]*Game{}
	mu    sync.Mutex
)

//go:embed static
var staticFiles embed.FS

func main() {
	// Serve embedded static files from the "static" subdirectory
	subFS, err := iofs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("failed to get static subdir: %v", err)
	}
	httpFS := http.FS(subFS)
	fileServer := http.FileServer(httpFS)
	http.Handle("/static/", http.StripPrefix("/static/", fileServer))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// determine path to serve from embedded static root
		p := "index.html"
		if r.URL.Path != "/" {
			p = path.Clean(r.URL.Path)
			if len(p) > 0 && p[0] == '/' {
				p = p[1:]
			}
		}
		// open file from the embedded static subFS via httpFS (returns http.File)
		f, err := httpFS.Open(p)
		if err != nil {
			// fallback to index.html
			f, err = httpFS.Open("index.html")
			if err != nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			p = "index.html"
		}
		defer f.Close()
		http.ServeContent(w, r, p, time.Time{}, f)
	})

	http.HandleFunc("/api/new", handleNewGame)
	http.HandleFunc("/api/guess", handleGuess)

	addr := "0.0.0.0:8080"
	log.Printf("starting server on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func handleNewGame(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req NewGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.CodeLength <= 0 {
		req.CodeLength = 4
	}
	if req.Colors <= 0 {
		req.Colors = 6
	}
	if req.Attempts <= 0 {
		req.Attempts = 10
	}

	secret := make([]int, req.CodeLength)
	for i := 0; i < req.CodeLength; i++ {
		n, _ := randInt(req.Colors)
		secret[i] = int(n)
	}

	id := randID(12)
	g := &Game{Secret: secret, AttemptsMax: req.Attempts, AttemptsLeft: req.Attempts, CodeLength: req.CodeLength, Colors: req.Colors}

	mu.Lock()
	games[id] = g
	mu.Unlock()

	resp := NewGameResponse{ID: id, Game: *g}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleGuess(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req GuessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	mu.Lock()
	g, ok := games[req.ID]
	mu.Unlock()
	if !ok {
		http.Error(w, "game not found", http.StatusNotFound)
		return
	}

	if len(req.Guess) != g.CodeLength {
		http.Error(w, "invalid guess length", http.StatusBadRequest)
		return
	}

	exact, partial := evaluateGuess(g.Secret, req.Guess)

	if g.AttemptsLeft > 0 {
		g.AttemptsLeft--
	}

	won := exact == g.CodeLength
	lost := g.AttemptsLeft <= 0 && !won

	resp := GuessResponse{Exact: exact, Partial: partial, AttemptsLeft: g.AttemptsLeft, Won: won, Lost: lost}
	if lost {
		resp.Secret = g.Secret
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func randID(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "id"
	}
	return hex.EncodeToString(b)
}

func randInt(max int) (int64, error) {
	m := big.NewInt(int64(max))
	n, err := rand.Int(rand.Reader, m)
	if err != nil {
		return 0, err
	}
	return n.Int64(), nil
}

func evaluateGuess(secret []int, guess []int) (int, int) {
	exact := 0
	partial := 0

	counts := map[int]int{}
	for i := 0; i < len(secret); i++ {
		if secret[i] == guess[i] {
			exact++
		} else {
			counts[secret[i]]++
		}
	}
	for i := 0; i < len(secret); i++ {
		if secret[i] != guess[i] {
			if counts[guess[i]] > 0 {
				partial++
				counts[guess[i]]--
			}
		}
	}
	return exact, partial
}
