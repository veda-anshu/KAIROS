#!/usr/bin/env bash
# ================================================================
# setup.sh — One-command Kairos environment setup (WSL / Ubuntu)
# Run: chmod +x setup.sh && ./setup.sh
# ================================================================
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

step() { echo -e "\n${CYAN}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════╗"
echo "  ║        KAIROS — SETUP             ║"
echo "  ║  Options-Theoretic HPC Scheduler  ║"
echo "  ╚═══════════════════════════════════╝"
echo -e "${NC}"

# ── 1. C++ Build Dependencies ──────────────────────────────────
step "Installing C++ build tools"
sudo apt-get update -q
sudo apt-get install -y cmake g++ build-essential > /dev/null
ok "cmake + g++ installed"

# ── 2. Python Dependencies ──────────────────────────────────────
step "Installing Python dependencies"
pip install --break-system-packages -q \
    numpy scipy pandas flask flask-cors
ok "Python packages installed"

# ── 3. Node.js ──────────────────────────────────────────────────
step "Checking Node.js"
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing via nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    source "$NVM_DIR/nvm.sh"
    nvm install --lts
fi
ok "Node.js $(node --version)"

# ── 4. npm packages ─────────────────────────────────────────────
step "Installing React dependencies"
cd dashboard
npm install --silent
cd ..
ok "npm packages installed"

# ── 5. Build C++ engine ─────────────────────────────────────────
step "Building C++17 engine"
mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXPORT_COMPILE_COMMANDS=ON 2>&1 | tail -3
make -j$(nproc) 2>&1 | tail -5
cd ..
ok "Engine built → ./build/kairos-engine"

# ── 6. Quick smoke test ─────────────────────────────────────────
step "Running smoke test (20 jobs, 4 slots)"
OUTPUT=$(./build/kairos-engine simulate --n_jobs 20 --n_slots 4 --seed 42 2>&1)
if echo "$OUTPUT" | grep -q '"kairos"'; then
    ok "Engine test passed"
    echo "$OUTPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
f, k = d['fifo'], d['kairos']
print(f'  FIFO  wait: {f[\"mean_wait_hours\"]}h   util: {round(f[\"utilization\"]*100,1)}%')
print(f'  KAIROS wait: {k[\"mean_wait_hours\"]}h   util: {round(k[\"utilization\"]*100,1)}%')
print(f'  Improvement: {d[\"improvement\"][\"wait_reduction_pct\"]}% wait reduction')
"
else
    err "Engine test failed:\n$OUTPUT"
fi

# ── 7. Calibrate (optional) ─────────────────────────────────────
step "Running log-normal calibration (synthetic data)"
cd data && python calibrate.py --n 1000 2>&1 | grep -E "(mu|sigma|verdict|Use:)" && cd ..

# ── Done ────────────────────────────────────────────────────────
echo -e "\n${GREEN}════════════════════════════════════════"
echo "  Setup complete!  Start Kairos:"
echo ""
echo "  Terminal 1 (API):       cd api && python app.py"
echo "  Terminal 2 (Dashboard): cd dashboard && npm run dev"
echo "  Terminal 3 (Engine):    ./build/kairos-engine simulate"
echo "════════════════════════════════════════${NC}\n"
