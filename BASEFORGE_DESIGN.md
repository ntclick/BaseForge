# BaseForge Trade Alert Agent - Complete Design Document

## 📋 Table of Contents
1. Project Overview
2. Workflow & User Journey
3. System Architecture
4. Technical Specifications
5. UX/UI Design
6. Implementation Plan
7. Deployment & Scaling

---

## 🎯 Project Overview

### Vision
**BaseForge Trade Alert Agent** - A real-time token monitoring and alert system for Base ecosystem, powered by Hermes Agent and Binance API.

### Key Features
- 🔔 Real-time trade alerts (buy/sell size)
- 📊 Technical analysis signals (EMA, RSI, Bollinger Bands, MACD)
- 📈 Volume spike detection
- ⚠️ Dump risk warnings
- 🎯 Support/Resistance breakouts
- 💰 Cost: $0.05/user/month (10x cheaper than whale tracking)

### Target Users
- Crypto traders on Base ecosystem
- DeFi enthusiasts
- Token analysts
- Smart money trackers

### Business Model
```
Free Tier:
  - 1 token monitoring
  - Basic alerts (trade size + volume)
  - Telegram only
  - Cost: $0/user

Premium $5/month:
  - Unlimited tokens
  - All technical signals
  - Custom thresholds
  - Discord + Email
  - Cost: $0.50/user → Margin: $4.50

VIP $15/month:
  - All premium features
  - Smart money alerts (Birdeye)
  - Custom patterns
  - Priority support
  - Cost: $1.50/user → Margin: $13.50
```

---

## 🔄 Workflow & User Journey

### Phase 1: User Onboarding

```
┌─────────────────────────────────────────┐
│ 1. User visits BaseForge                │
├─────────────────────────────────────────┤
│ - Sign in with wallet (Base)            │
│ - Mint agent NFT (optional)             │
│ - Get agent_id                          │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 2. Setup Telegram Bot                   │
├─────────────────────────────────────────┤
│ - Connect Telegram account              │
│ - Verify chat_id                        │
│ - Test connection                       │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 3. Configure First Agent                │
├─────────────────────────────────────────┤
│ - Choose token (AERO, BRETT, etc)       │
│ - Select alert types                    │
│ - Set thresholds                        │
│ - Review & deploy                       │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 4. Activate with LLM Key                │
├─────────────────────────────────────────┤
│ - Paste OpenAI/Claude/DeepSeek key      │
│ - Encrypt & store securely              │
│ - Agent ready to chat                   │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ 5. Start Monitoring                     │
├─────────────────────────────────────────┤
│ - Hermes monitors Binance WebSocket     │
│ - Real-time alerts to Telegram          │
│ - User can manage from dashboard        │
└─────────────────────────────────────────┘
```

### Phase 2: Alert Generation

```
┌──────────────────────────────────────────┐
│ Binance WebSocket                        │
│ Real-time AERO/USDT price + volume       │
└────────────┬─────────────────────────────┘
             ↓
┌──────────────────────────────────────────┐
│ Hermes Agent Processing                  │
├──────────────────────────────────────────┤
│ 1. Receive price/volume data             │
│ 2. Calculate indicators (EMA, RSI, etc)  │
│ 3. Check user's alert rules              │
│ 4. Detect patterns                       │
│ 5. Generate alert message                │
└────────────┬─────────────────────────────┘
             ↓
┌──────────────────────────────────────────┐
│ Alert Dispatcher                         │
├──────────────────────────────────────────┤
│ - Format message (emoji + data)          │
│ - Add technical analysis                 │
│ - Include trading recommendation         │
│ - Send to Telegram                       │
└──────────────────────────────────────────┘
```

### Phase 3: User Interaction

```
User receives alert in Telegram:

🚨 AERO TRADE ALERT
├─ Trade: BUY $75,500
├─ Price: $1.234
├─ Signals: ✅ Volume spike, ✅ EMA bullish
├─ Recommendation: WATCH
└─ [View Dashboard] [Manage Agent] [Snooze]

User can:
- View full analysis on dashboard
- Adjust alert thresholds
- Pause/resume monitoring
- Add more tokens
- Chat with Hermes for analysis
```

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BaseForge Platform                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐ │
│  │  Web UI      │    │  Hermes      │    │ Telegram │ │
│  │  (Next.js)   │    │  Agent       │    │   Bot    │ │
│  │              │    │              │    │          │ │
│  │ - Setup      │    │ - Monitor    │    │ - Alerts │ │
│  │ - Dashboard  │    │ - Calculate  │    │ - Chat   │ │
│  │ - Settings   │    │ - Detect     │    │          │ │
│  └──────┬───────┘    └──────┬───────┘    └────┬─────┘ │
│         │                   │                  │       │
│         └───────────────────┼──────────────────┘       │
│                             │                         │
│                    ┌────────▼────────┐                │
│                    │   Agent Storage  │                │
│                    │ ~/.hermes/agents/│                │
│                    │  {agent_id}/     │                │
│                    └────────┬────────┘                │
│                             │                         │
│                    ┌────────▼────────┐                │
│                    │   Database       │                │
│                    │ - User config    │                │
│                    │ - Alert history  │                │
│                    │ - Settings       │                │
│                    └──────────────────┘                │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐         ┌──────────┐        ┌──────────┐
    │  Binance │         │ Alchemy  │        │ Base RPC │
    │   API    │         │   API    │        │          │
    │ (FREE)   │         │ (FREE)   │        │ (FREE)   │
    └─────────┘         └──────────┘        └──────────┘
```

### Component Breakdown

#### 1. **Web UI (Next.js)**
```
Routes:
  /                    → Landing page
  /dashboard           → Agent dashboard
  /agents              → My agents
  /agents/new          → Create agent
  /agents/{id}         → Agent settings
  /alerts              → Alert history
  /settings            → User settings
  /docs                → Documentation
```

#### 2. **Hermes Agent**
```
Responsibilities:
  - Monitor Binance WebSocket (real-time)
  - Calculate technical indicators
  - Detect trading patterns
  - Manage user configurations
  - Generate alerts
  - Handle multi-tenant isolation
  
Skills needed:
  - binance_monitor.py
  - technical_analyzer.py
  - pattern_detector.py
  - alert_generator.py
  - telegram_dispatcher.py
```

#### 3. **Telegram Bot**
```
Functions:
  - Receive alerts from Hermes
  - Send formatted messages
  - Handle user commands
  - Provide quick actions
  - Manage subscriptions
```

#### 4. **Storage**
```
Agent Folder Structure:
~/.hermes/agents/{agent_id}/
├── config.json              # Agent config
├── llm_key.enc              # Encrypted LLM key
├── memory/
│   ├── sessions/
│   └── context.json
├── skills/
│   ├── binance_monitor.py
│   ├── technical_analyzer.py
│   ├── pattern_detector.py
│   └── alert_generator.py
├── tools/
│   └── tools.json
└── logs/
    └── agent.log
```

---

## 📊 Technical Specifications

### 1. Data Sources

#### Binance API (FREE)
```
Endpoints:
  - GET /api/v3/ticker/24hr?symbol=AEROUSDT
    → 24h price, volume, change
  
  - GET /api/v3/klines?symbol=AEROUSDT&interval=1h&limit=100
    → OHLCV candles (1m, 5m, 15m, 1h, 4h, 1d)
  
  - WebSocket stream
    → Real-time price updates
    → Aggregate trades
    → Order book depth

Cost: $0 forever
Latency: <100ms
Rate limit: 1200 requests/minute (generous)
```

#### Alchemy Base (FREE tier)
```
Optional for:
  - Wallet balance lookups
  - Transaction history
  - Token transfer events

Cost: $0 (free tier: 300M CU/month)
```

### 2. Technical Indicators

#### A. Moving Averages
```python
# EMA (Exponential Moving Average)
EMA_20 = calculate_ema(prices, period=20)
EMA_50 = calculate_ema(prices, period=50)
EMA_200 = calculate_ema(prices, period=200)

Signals:
  - EMA20 > EMA50 > EMA200 → Strong uptrend
  - EMA20 < EMA50 < EMA200 → Strong downtrend
  - EMA20 crosses above EMA50 → Bullish signal
  - EMA20 crosses below EMA50 → Bearish signal
```

#### B. RSI (Relative Strength Index)
```python
# RSI = 100 - (100 / (1 + RS))
# RS = Average Gain / Average Loss (14-period)
RSI = calculate_rsi(prices, period=14)

Signals:
  - RSI < 30 → Oversold (buy signal)
  - RSI > 70 → Overbought (sell signal)
  - RSI 30-70 → Neutral
  - Divergence: Price makes new high but RSI doesn't
```

#### C. Bollinger Bands
```python
# BB = SMA ± (2 × StdDev)
SMA = calculate_sma(prices, period=20)
StdDev = calculate_std_dev(prices, period=20)
Upper_Band = SMA + (2 * StdDev)
Lower_Band = SMA - (2 * StdDev)

Signals:
  - Price touches upper band → Sell signal
  - Price touches lower band → Buy signal
  - Band squeeze → Breakout coming
  - Price outside bands → Strong trend
```

#### D. MACD (Moving Average Convergence Divergence)
```python
# MACD = EMA12 - EMA26
# Signal = EMA9(MACD)
# Histogram = MACD - Signal
MACD = calculate_ema(prices, 12) - calculate_ema(prices, 26)
Signal = calculate_ema(MACD, 9)
Histogram = MACD - Signal

Signals:
  - MACD crosses above signal → Bullish
  - MACD crosses below signal → Bearish
  - MACD crosses above zero → Trend change
  - Histogram divergence → Momentum shift
```

#### E. Volume Analysis
```python
# Volume Average (20-period)
Volume_Avg = average(volumes[-20:])
Volume_Spike = current_volume / Volume_Avg

Signals:
  - Volume > 3x average → Significant move
  - Volume > 5x average → Major move
  - Buy volume > sell volume 2x → Accumulation
  - Sell volume > buy volume 2x → Distribution
```

### 3. Alert Rules

#### Trade Size Alerts
```
User sets threshold: $50,000

Rule:
  IF trade_size > threshold THEN
    Generate alert with:
      - Trade direction (BUY/SELL)
      - Amount in USD
      - Current price
      - 24h change
      - Technical signals
```

#### Volume Spike Alerts
```
User sets multiplier: 3x

Rule:
  IF volume > (avg_volume * multiplier) THEN
    Generate alert with:
      - Volume amount
      - Multiplier (3x, 5x, etc)
      - Price action
      - Trend direction
```

#### Technical Signal Alerts
```
EMA Crossover:
  IF EMA20 crosses EMA50 THEN
    Alert: "EMA20 crossed EMA50 (bullish/bearish)"

RSI Extreme:
  IF RSI < 30 THEN
    Alert: "RSI oversold - potential buy"
  IF RSI > 70 THEN
    Alert: "RSI overbought - potential sell"

Bollinger Bands:
  IF price touches upper_band THEN
    Alert: "Price at upper band - sell signal"
  IF price touches lower_band THEN
    Alert: "Price at lower band - buy signal"

MACD Crossover:
  IF MACD crosses signal THEN
    Alert: "MACD signal (bullish/bearish)"
```

#### Pattern Detection Alerts
```
Support/Resistance Breakout:
  IF price breaks resistance THEN
    Alert: "Breakout above resistance"
    Include: Resistance level, target level

Dump Risk:
  IF holder_concentration > 5% THEN
    Alert: "⚠️ High concentration risk"
  IF recent_pump > 50% THEN
    Alert: "⚠️ Recent pump - pullback likely"

Consolidation Breakout:
  IF price_in_range AND volume_building THEN
    Alert: "Consolidation breakout incoming"
```

---

## 🎨 UX/UI Design

### 1. Setup Wizard

```
Step 1: Choose Token
┌─────────────────────────────────┐
│ Select Token to Monitor         │
├─────────────────────────────────┤
│ Search: [AERO________]          │
│                                 │
│ Popular:                        │
│ ☐ AERO    (Base)               │
│ ☐ BRETT   (Base)               │
│ ☐ HIGHER  (Base)               │
│ ☐ ETH     (Base)               │
│ ☐ USDC    (Base)               │
│                                 │
│ [Next]                          │
└─────────────────────────────────┘

Step 2: Select Alert Types
┌─────────────────────────────────┐
│ What alerts do you want?        │
├─────────────────────────────────┤
│ ☑ Trade Size                   │
│   Threshold: [$50,000]          │
│                                 │
│ ☑ Volume Spike                 │
│   Multiplier: [3x]              │
│                                 │
│ ☑ EMA Crossover                │
│ ☑ RSI Signals                  │
│ ☑ Bollinger Bands              │
│ ☑ MACD Crossover               │
│ ☐ Support/Resistance           │
│ ☐ Dump Risk                    │
│ ☐ Consolidation Breakout       │
│                                 │
│ [Next]                          │
└─────────────────────────────────┘

Step 3: Advanced Settings
┌─────────────────────────────────┐
│ Fine-tune Your Agent            │
├─────────────────────────────────┤
│ Trade Size Threshold:           │
│ [$50,000]                       │
│                                 │
│ Volume Multiplier:              │
│ [3x]                            │
│                                 │
│ RSI Oversold:                   │
│ [30]                            │
│                                 │
│ RSI Overbought:                 │
│ [70]                            │
│                                 │
│ Timeframe:                      │
│ [1h, 4h, 1d]                    │
│                                 │
│ [Next]                          │
└─────────────────────────────────┘

Step 4: Review & Deploy
┌─────────────────────────────────┐
│ Review Your Agent               │
├─────────────────────────────────┤
│ Name: AERO Trade Alert          │
│ Token: AERO                     │
│ Alerts: 6 types enabled         │
│ Trade Size: >$50K               │
│ Volume: >3x average             │
│ Channel: Telegram               │
│ Status: Ready to deploy         │
│                                 │
│ [Deploy] [Edit] [Cancel]        │
└─────────────────────────────────┘

Step 5: LLM Setup
┌─────────────────────────────────┐
│ Add Your LLM API Key            │
├─────────────────────────────────┤
│ Provider:                       │
│ [OpenAI ▼]                      │
│                                 │
│ API Key:                        │
│ [sk-proj-...........] (hidden)  │
│                                 │
│ ✓ Key verified                  │
│                                 │
│ [Activate Agent]                │
└─────────────────────────────────┘
```

### 2. Alert Format (Telegram)

```
🚨 AERO TRADE ALERT

📊 Trade Details
├─ Direction: BUY
├─ Amount: $75,500
├─ Price: $1.234
├─ 24h Change: +2.8%
└─ Volume: 3.2x average

📈 Technical Signals
├─ ✅ EMA20 > EMA50 (bullish)
├─ ✅ RSI 65 (strong)
├─ ✅ Volume spike detected
├─ ⚠️ Price near upper band
└─ ⚠️ Recent pump 45%

💡 Analysis
Whale accumulation detected. Volume and price 
action suggest bullish momentum, but watch for 
pullback given recent pump.

🎯 Recommendation: WATCH
├─ Entry: $1.20-$1.25
├─ Stop Loss: $1.14 (-7%)
├─ Take Profit 1: $1.34 (+8%)
└─ Take Profit 2: $1.48 (+20%)

🔗 Trade: aerodrome.finance/swap
⏰ 14:34 UTC | 📍 Base Chain

[View Dashboard] [Manage] [Snooze 1h]
```

### 3. Dashboard

```
┌──────────────────────────────────────────┐
│ BaseForge Dashboard                      │
├──────────────────────────────────────────┤
│                                          │
│ My Agents (3)                            │
│ ┌────────────────────────────────────┐  │
│ │ AERO Trade Alert          [Active] │  │
│ │ Alerts today: 12                   │  │
│ │ Last alert: 5 min ago              │  │
│ │ [View] [Edit] [Pause]              │  │
│ └────────────────────────────────────┘  │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ BRETT Trade Alert         [Active] │  │
│ │ Alerts today: 8                    │  │
│ │ Last alert: 15 min ago             │  │
│ │ [View] [Edit] [Pause]              │  │
│ └────────────────────────────────────┘  │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ ETH Trade Alert           [Paused] │  │
│ │ Alerts today: 0                    │  │
│ │ Last alert: 2 hours ago            │  │
│ │ [View] [Edit] [Resume]             │  │
│ └────────────────────────────────────┘  │
│                                          │
│ [+ Create New Agent]                     │
│                                          │
├──────────────────────────────────────────┤
│ Recent Alerts                            │
│ ┌────────────────────────────────────┐  │
│ │ 🚨 AERO BUY $75.5K    14:34 UTC   │  │
│ │ 🚨 AERO SELL $52.3K   14:28 UTC   │  │
│ │ 🚨 BRETT BUY $45.1K   14:15 UTC   │  │
│ │ 📊 ETH EMA Crossover  13:45 UTC   │  │
│ └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

---

## 🔧 Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Setup Hermes agent framework
- [ ] Binance WebSocket integration
- [ ] Technical indicator calculations
- [ ] Agent storage structure

### Phase 2: Core Features (Week 2)
- [ ] Trade size alerts
- [ ] Volume spike detection
- [ ] Technical signal generation
- [ ] Telegram bot integration

### Phase 3: UI & Deployment (Week 3)
- [ ] Web UI (Next.js)
- [ ] Setup wizard
- [ ] Dashboard
- [ ] Deployment on Railway/Vercel

### Phase 4: Polish & Launch (Week 4)
- [ ] Testing & bug fixes
- [ ] Documentation
- [ ] Performance optimization
- [ ] Launch on Base

---

## 📦 Deployment & Scaling

### Infrastructure
```
Frontend: Vercel
  - Next.js app
  - Dashboard UI
  - Setup wizard

Backend: Railway
  - Hermes Agent
  - API server
  - Database

Storage: Local + PostgreSQL
  - Agent configs
  - Alert history
  - User settings

Telegram: Telegram Bot API
  - Alert delivery
  - User commands
```

### Scaling Strategy
```
Phase 1: Single Hermes instance
  - Up to 100 agents
  - 1 server ($50/month)

Phase 2: Multiple Hermes instances
  - Up to 1000 agents
  - Load balancer + 3 servers ($200/month)

Phase 3: Distributed Hermes
  - Up to 10K agents
  - Kubernetes cluster ($500/month)
```

---

## 💰 Financial Projections

### Year 1 Goals
```
Users:
  - 1000 free users
  - 100 premium users ($5/month)
  - 20 VIP users ($15/month)

Revenue:
  - Premium: 100 × $5 × 12 = $6,000
  - VIP: 20 × $15 × 12 = $3,600
  - Total: $9,600/year

Costs:
  - Infrastructure: $600/year
  - Binance API: $0
  - Telegram: $0
  - Other: $200/year
  - Total: $800/year

Profit: $8,800/year
Margin: 92%
```

---

## ✅ Next Steps

1. **Approve design** ✓
2. **Start development** (Phase 1)
3. **Build MVP** (4 weeks)
4. **Beta testing** (1 week)
5. **Launch** 🚀

Ready to build? 🔥
