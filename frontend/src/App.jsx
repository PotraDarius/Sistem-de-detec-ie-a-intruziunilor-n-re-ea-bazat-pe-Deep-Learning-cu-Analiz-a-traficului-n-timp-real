import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import {
  Shield, Activity, AlertTriangle, Network, Cpu, Zap,
  Radio, ServerCrash, Globe, Lock, Eye, Wifi, ChevronRight,
  CircleDot, ArrowUpRight, ArrowDownRight, Minus,
  Play, Square, Download, HelpCircle,
  User as UserIcon, LogOut, Settings
} from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import { ThemeProvider, useTheme } from './ThemeContext';
import ThemeToggle from './ThemeToggle';
import LoginPage from './LoginPage';
import AccountPage from './AccountPage';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';
const POLL_INTERVAL_MS = 2500;
const MAX_FEED_ROWS = 40;
const TIMELINE_BUCKETS = 30;

if (!window.__benchResults) {
  window.__benchResults = [];
  console.log("📊 Benchmark frontend ACTIV. Rezultatele în window.__benchResults");
}

const ATTACK_META = {
  Normal:      { color: '#22c55e', glow: 'rgba(34,197,94,0.18)',  icon: Shield,        severity: 0, label: 'BENIGN'       },
  Suspicious:  { color: '#f59e0b', glow: 'rgba(245,158,11,0.22)', icon: HelpCircle,    severity: 1, label: 'LOW-CONFIDENCE'},
  DoS:         { color: '#ef4444', glow: 'rgba(239,68,68,0.22)',  icon: ServerCrash,   severity: 4, label: 'DENIAL-OF-SVC' },
  DDoS:        { color: '#dc2626', glow: 'rgba(220,38,38,0.24)',  icon: ServerCrash,   severity: 5, label: 'DISTRIB-DOS'   },
  PortScan:    { color: '#f97316', glow: 'rgba(249,115,22,0.22)', icon: Radio,         severity: 2, label: 'RECONNAISSANCE'},
  BruteForce:  { color: '#eab308', glow: 'rgba(234,179,8,0.22)',  icon: Lock,          severity: 3, label: 'CREDENTIAL-ATK'},
  WebAttack:   { color: '#ec4899', glow: 'rgba(236,72,153,0.22)', icon: Globe,         severity: 3, label: 'WEB-EXPLOIT'   },
  Botnet:      { color: '#a855f7', glow: 'rgba(168,85,247,0.22)', icon: Wifi,          severity: 4, label: 'C2-TRAFFIC'    },
};
const ATTACK_KEYS = Object.keys(ATTACK_META);

const isConfirmedAttack = (cls) => cls !== 'Normal' && cls !== 'Suspicious';
const isNonNormal       = (cls) => cls !== 'Normal';

// Culori pentru grafice (Recharts), în funcție de temă.
function useChartTheme() {
  const { isDark } = useTheme();
  return isDark
    ? {
        tooltipBg: '#0a0a0a', tooltipBorder: '#27272a', tooltipText: '#e4e4e7', label: '#a1a1aa',
        grid: '#1f1f23', axisTick: '#52525b', axisLine: '#27272a', pieStroke: '#09090b', cursor: '#3f3f46',
      }
    : {
        tooltipBg: '#ffffff', tooltipBorder: '#e4e4e7', tooltipText: '#18181b', label: '#52525b',
        grid: '#e4e4e7', axisTick: '#71717a', axisLine: '#d4d4d8', pieStroke: '#ffffff', cursor: '#a1a1aa',
      };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA GENERATOR — realistic distributions matching a 1D-CNN NIDS
// ─────────────────────────────────────────────────────────────────────────────
const COMMON_PORTS_DST = [80, 443, 22, 3389, 8080, 53, 21, 25, 445, 3306, 5432, 8443, 6379];
const COMMON_PORTS_SRC = () => 30000 + Math.floor(Math.random() * 35000);

function randIP(internal = true) {
  if (internal) {
    return `192.168.${1 + Math.floor(Math.random() * 3)}.${2 + Math.floor(Math.random() * 250)}`;
  }
  const blocks = [
    () => `${45 + Math.floor(Math.random() * 60)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    () => `${172}.${16 + Math.floor(Math.random() * 16)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    () => `${185 + Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
  ];
  return blocks[Math.floor(Math.random() * blocks.length)]();
}

function drawClass() {
  const r = Math.random();
  if (r < 0.76) return 'Normal';
  if (r < 0.84) return 'PortScan';
  if (r < 0.89) return 'DoS';
  if (r < 0.92) return 'DDoS';
  if (r < 0.95) return 'BruteForce';
  if (r < 0.97) return 'WebAttack';
  if (r < 0.985) return 'Botnet';
  return 'Suspicious';
}

function genFlow(now = Date.now()) {
  const cls = drawClass();
  const internalSrc = cls === 'Normal' ? Math.random() < 0.55 : Math.random() < 0.25;
  const ipSrc = randIP(internalSrc);
  const ipDst = randIP(!internalSrc && Math.random() < 0.6);
  const portDst = cls === 'PortScan'
    ? Math.floor(Math.random() * 65535)
    : COMMON_PORTS_DST[Math.floor(Math.random() * COMMON_PORTS_DST.length)];
  const portSrc = COMMON_PORTS_SRC();

  let conf;
  if (cls === 'Normal') conf = 88 + Math.random() * 11;
  else if (cls === 'DoS') conf = 92 + Math.random() * 7;
  else if (cls === 'DDoS') conf = 90 + Math.random() * 9;
  else if (cls === 'Botnet') conf = 78 + Math.random() * 18;
  else if (cls === 'Suspicious') conf = 50 + Math.random() * 19;
  else conf = 82 + Math.random() * 16;

  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date(now - Math.random() * 1500).toISOString(),
    ipSrc, portSrc, ipDst, portDst,
    packets: 5 + Math.floor(Math.random() * 80),
    durationMs: Math.round((10 + Math.random() * 2400) * 100) / 100,
    prediction: cls,
    confidence: Math.round(conf * 100) / 100,
  };
}

function mockStats(feed) {
  const dist = ATTACK_KEYS.reduce((a, k) => (a[k] = 0, a), {});
  feed.forEach(f => { dist[f.prediction] = (dist[f.prediction] || 0) + 1; });
  const total = feed.length || 1;
  const alerts = feed.filter(f => isConfirmedAttack(f.prediction)).length;
  return {
    totalFlows: 14820 + feed.length * 7 + Math.floor(Math.random() * 50),
    totalPackets: 2_847_392 + feed.length * 312 + Math.floor(Math.random() * 1500),
    criticalAlerts: alerts,
    normalRatio: ((dist.Normal / total) * 100),
    activeFlows: 18 + Math.floor(Math.random() * 22),
    distribution: dist,
    throughputMbps: (12 + Math.random() * 38).toFixed(1),
    avgConfidence: feed.length
      ? (feed.reduce((s, f) => s + f.confidence, 0) / feed.length).toFixed(1)
      : '0.0',
  };
}

function mockTimeline(buckets = TIMELINE_BUCKETS) {
  const now = Date.now();
  const out = [];
  for (let i = buckets - 1; i >= 0; i--) {
    const t = new Date(now - i * 5000);
    const base = 14 + Math.sin(i / 3) * 8 + Math.random() * 6;
    const attacks = Math.max(0, Math.random() < 0.3 ? Math.floor(Math.random() * 5) : 0);
    out.push({
      time: t.toTimeString().slice(0, 8),
      normal: Math.round(base),
      attacks,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA HOOK — polls backend, falls back to mock seamlessly
// ─────────────────────────────────────────────────────────────────────────────
function useNIDSData() {
  const { apiFetch } = useAuth();

  const [feed, setFeed] = useState(() =>
    Array.from({ length: 24 }, (_, i) => genFlow(Date.now() - (24 - i) * 800))
  );
  const [stats, setStats] = useState(() => mockStats(feed));
  const [timeline, setTimeline] = useState(() => mockTimeline());
  const [backendOnline, setBackendOnline] = useState(false);

  const [isSniffing, setIsSniffing] = useState(true);
  const [hasLog, setHasLog] = useState(false);

  const [interfaces, setInterfaces] = useState(['eth0']);
  const [selectedIface, setSelectedIface] = useState('eth0');

  const feedRef = useRef(feed);
  feedRef.current = feed;

  useEffect(() => {
    apiFetch(`/api/interfaces`)
      .then(res => res.json())
      .then(data => {
        if (data.interfaces) setInterfaces(data.interfaces);
        if (data.current) setSelectedIface(data.current);
      })
      .catch(err => console.error("Eroare la încărcarea interfețelor:", err));
  }, [apiFetch]);

  const toggleSniffer = async () => {
    const nextState = !isSniffing;
    setIsSniffing(nextState);
    if (backendOnline) {
      try {
        if (nextState) {
          setHasLog(false);
          setFeed([]);
          await apiFetch(`/api/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interface: selectedIface })
          });
        } else {
          await apiFetch(`/api/stop`, { method: 'POST' });
          setFeed([]);
          setHasLog(true);
        }
      } catch (err) {
        console.error("Eroare toggle sniffer:", err);
        setIsSniffing(!nextState);
      }
    } else {
      if (nextState) {
        setHasLog(false);
        setFeed([]);
      } else {
        setFeed([]);
      }
    }
  };

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      const t_start = performance.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1500);
        const t_fetch_start = performance.now();
        const [rRecent, rStats, rTl] = await Promise.all([
          apiFetch(`/api/recent?limit=${MAX_FEED_ROWS}`, { signal: ctrl.signal }),
          apiFetch(`/api/stats`, { signal: ctrl.signal }),
          apiFetch(`/api/timeline?buckets=${TIMELINE_BUCKETS}`, { signal: ctrl.signal }),
        ]);
        const t_fetch_end = performance.now();
        clearTimeout(timer);
        if (!rRecent.ok || !rStats.ok || !rTl.ok) throw new Error('bad response');
        const t_parse_start = performance.now();
        const recent  = await rRecent.json();
        const sObj    = await rStats.json();
        const tlObj   = await rTl.json();
        const t_parse_end = performance.now();
        if (!alive) return;
        const t_setstate_start = performance.now();
        setFeed(recent.flows || []);
        setStats(sObj);
        setTimeline(tlObj.points || []);
        setIsSniffing(sObj.isSniffing);
        if (typeof sObj.hasLog === 'boolean') setHasLog(sObj.hasLog && !sObj.isSniffing);
        setBackendOnline(true);
        const t_end = performance.now();

        window.__benchResults.push({
          timestamp: new Date().toISOString(),
          total_ms: +(t_end - t_start).toFixed(2),
          fetch_ms: +(t_fetch_end - t_fetch_start).toFixed(2),
          parse_ms: +(t_parse_end - t_parse_start).toFixed(2),
          setstate_ms: +(t_end - t_setstate_start).toFixed(2),
        });
        if (window.__benchResults.length % 10 === 0) {
          console.log(`📊 ${window.__benchResults.length} măsurători colectate`);
        }
      }catch {
        if (!alive) return;
        setBackendOnline(false);
        if(isSniffing){
          const newOnes = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => genFlow());
          const merged = [...newOnes, ...feedRef.current].slice(0, MAX_FEED_ROWS);
          setFeed(merged);
          setStats(mockStats(merged));
          setTimeline(prev => {
            const last = prev[prev.length - 1];
            const t = new Date();
            const base = 14 + Math.random() * 12;
            const attacks = newOnes.filter(f => isConfirmedAttack(f.prediction)).length;
            const nextPoint = {
              time: t.toTimeString().slice(0, 8),
              normal: Math.round(base),
              attacks,
            };
            return [...prev.slice(-(TIMELINE_BUCKETS - 1)), nextPoint];
          });
        }
      }
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [isSniffing, apiFetch]);

  return { feed, stats, timeline, backendOnline, isSniffing, toggleSniffer, interfaces, selectedIface, setSelectedIface, hasLog };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE CLOCK
// ─────────────────────────────────────────────────────────────────────────────
function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n) => n?.toLocaleString('en-US') ?? '0';
const fmtTime = (iso) => {
  try { return new Date(iso).toTimeString().slice(0, 8); }
  catch { return '--:--:--'; }
};

// ─────────────────────────────────────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function StatusDot({ online }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`} />
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent = 'cyan', trend }) {
  const accentMap = {
    cyan:    { border: 'border-cyan-500/30',    text: 'text-cyan-700 dark:text-cyan-300',       iconBg: 'bg-cyan-500/10',    iconText: 'text-cyan-600 dark:text-cyan-400'    },
    rose:    { border: 'border-rose-500/40',    text: 'text-rose-700 dark:text-rose-300',       iconBg: 'bg-rose-500/10',    iconText: 'text-rose-600 dark:text-rose-400'    },
    emerald: { border: 'border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-600 dark:text-emerald-400' },
    amber:   { border: 'border-amber-500/30',   text: 'text-amber-700 dark:text-amber-300',     iconBg: 'bg-amber-500/10',   iconText: 'text-amber-600 dark:text-amber-400'   },
  };
  const a = accentMap[accent];
  const TrendIcon = trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const trendColor = trend > 0 ? 'text-emerald-500' : trend < 0 ? 'text-rose-500' : 'text-zinc-500';

  return (
    <div className={`relative overflow-hidden rounded border ${a.border} bg-white/70 dark:bg-zinc-950/60 p-4 group transition-all hover:bg-white dark:hover:bg-zinc-950/80`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-700 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
            <span>{label}</span>
          </div>
          <div className={`mt-2 font-mono text-3xl font-medium ${a.text} tabular-nums`}>
            {value}
          </div>
          {sub && (
            <div className="mt-1 flex items-center gap-1.5 text-xs font-mono text-zinc-500">
              {trend !== undefined && <TrendIcon className={`h-3 w-3 ${trendColor}`} />}
              <span>{sub}</span>
            </div>
          )}
        </div>
        <div className={`shrink-0 rounded ${a.iconBg} p-2`}>
          <Icon className={`h-4 w-4 ${a.iconText}`} />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, hint, right }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/60 dark:bg-zinc-950/40">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-zinc-500" />
        <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-700 dark:text-zinc-300">{title}</h3>
        {hint && <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600">{hint}</span>}
      </div>
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────────────────────────────────────
function ClassDistributionChart({ distribution }) {
  const ct = useChartTheme();
  const data = useMemo(() => ATTACK_KEYS
    .map(k => ({ name: k, value: distribution?.[k] ?? 0, color: ATTACK_META[k].color }))
    .filter(d => d.value > 0)
    , [distribution]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col h-full">
      <SectionHeader icon={Cpu} title="Class Distribution" hint="1D-CNN softmax output" />
      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 p-4 gap-4 min-h-0">
        <div className="md:col-span-3 min-h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                innerRadius="55%" outerRadius="85%"
                paddingAngle={2}
                stroke={ct.pieStroke}
                strokeWidth={2}
              >
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: ct.tooltipBg,
                  border: `1px solid ${ct.tooltipBorder}`,
                  borderRadius: 4,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  color: ct.tooltipText,
                  padding: '6px 10px',
                }}
                itemStyle={{ color: ct.tooltipText }}
                labelStyle={{ color: ct.label }}
                formatter={(v, n) => [`${v} flows (${((v / total) * 100).toFixed(1)}%)`, n]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="md:col-span-2 flex flex-col justify-center gap-1.5 font-mono text-xs">
          {ATTACK_KEYS.map(k => {
            const meta = ATTACK_META[k];
            const v = distribution?.[k] ?? 0;
            const pct = total ? (v / total) * 100 : 0;
            return (
              <div key={k} className="group">
                <div className="flex items-center justify-between gap-2 py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: meta.color }} />
                    <span className="text-zinc-600 dark:text-zinc-400 truncate">{k}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-zinc-400 dark:text-zinc-600 text-[10px]">{pct.toFixed(1)}%</span>
                    <span className="text-zinc-800 dark:text-zinc-200 tabular-nums w-8 text-right">{v}</span>
                  </div>
                </div>
                <div className="h-px bg-zinc-200 dark:bg-zinc-900 overflow-hidden">
                  <div
                    className="h-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TrafficTimelineChart({ timeline }) {
  const ct = useChartTheme();
  return (
    <div className="flex flex-col h-full">
      <SectionHeader
        icon={Activity}
        title="Traffic Volume"
        hint={`${TIMELINE_BUCKETS} × 5s windows`}
        right={
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" /> normal
            </span>
            <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 dark:bg-rose-400" /> attacks
            </span>
          </div>
        }
      />
      <div className="flex-1 p-4 pl-2 min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={timeline} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gNormal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gAttack" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#ef4444" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={ct.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: ct.axisTick, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
              stroke={ct.axisLine}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: ct.axisTick, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
              stroke={ct.axisLine}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: ct.tooltipBg,
                border: `1px solid ${ct.tooltipBorder}`,
                borderRadius: 4,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                color: ct.tooltipText,
              }}
              cursor={{ stroke: ct.cursor, strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Area
              type="monotone"
              dataKey="normal"
              stroke="#22c55e"
              strokeWidth={1.5}
              fill="url(#gNormal)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="attacks"
              stroke="#ef4444"
              strokeWidth={1.5}
              fill="url(#gAttack)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE ALERT FEED
// ─────────────────────────────────────────────────────────────────────────────
function ConfidenceBar({ value, color }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <div className="relative h-1 w-14 rounded-sm bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-all"
          style={{ width: `${value}%`, background: color, boxShadow: `0 0 4px ${color}` }}
        />
      </div>
      <span className="text-zinc-600 dark:text-zinc-400 tabular-nums w-12 text-right">{value.toFixed(1)}%</span>
    </div>
  );
}

function FlowRow({ flow }) {
  const meta = ATTACK_META[flow.prediction] || ATTACK_META.Normal;
  const isAttack = isNonNormal(flow.prediction);
  const Icon = meta.icon;

  return (
    <tr
      className={`group border-b border-zinc-200 dark:border-zinc-900/70 transition-colors ${
        isAttack ? 'hover:bg-rose-50 dark:hover:bg-rose-950/20' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900/40'
      }`}
      style={isAttack ? { background: `linear-gradient(90deg, ${meta.glow} 0%, transparent 60%)` } : undefined}
    >
      <td className="pl-3 py-2 w-1">
        <div
          className="h-6 w-[3px] rounded-sm"
          style={{ background: meta.color, boxShadow: isAttack ? `0 0 8px ${meta.color}` : 'none' }}
        />
      </td>
      <td className="px-2 py-2 font-mono text-[11px] text-zinc-500 tabular-nums whitespace-nowrap">
        {fmtTime(flow.ts)}
      </td>
      <td className="px-2 py-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300 tabular-nums whitespace-nowrap">
        {flow.ipSrc}<span className="text-zinc-400 dark:text-zinc-600">:{flow.portSrc}</span>
      </td>
      <td className="px-2 py-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-600 whitespace-nowrap">
        <ChevronRight className="h-3 w-3" />
      </td>
      <td className="px-2 py-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300 tabular-nums whitespace-nowrap">
        {flow.ipDst}<span className="text-zinc-400 dark:text-zinc-600">:{flow.portDst}</span>
      </td>
      <td className="px-2 py-2 font-mono text-[10px] text-zinc-500 tabular-nums whitespace-nowrap">
        {flow.packets}p · {flow.durationMs}ms
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <span
          className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
          style={{
            background: `${meta.color}1a`,
            color: meta.color,
            border: `1px solid ${meta.color}40`,
          }}
        >
          <Icon className="h-2.5 w-2.5" />
          {meta.label}
        </span>
      </td>
      <td className="pr-3 py-2 whitespace-nowrap">
        <ConfidenceBar value={flow.confidence} color={meta.color} />
      </td>
    </tr>
  );
}

function AlertFeed({ feed }) {
  const sorted = useMemo(() => [...feed].sort((a, b) => new Date(b.ts) - new Date(a.ts)), [feed]);
  const attackCount = sorted.filter(f => isConfirmedAttack(f.prediction)).length;
  const suspiciousCount = sorted.filter(f => f.prediction === 'Suspicious').length;

  return (
    <div className="flex flex-col h-full">
      <SectionHeader
        icon={Eye}
        title="Live Flow Inspector"
        hint={`${sorted.length} flows · ${attackCount} flagged · ${suspiciousCount} suspicious`}
        right={
          <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
            <CircleDot className="h-2.5 w-2.5 text-rose-500 dark:text-rose-400 animate-pulse" />
            STREAMING
          </div>
        }
      />
      <div className="flex-1 overflow-auto custom-scroll">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-950/95 backdrop-blur">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="w-1"></th>
              {['Timestamp', 'Source', '', 'Destination', 'Flow Stats', 'Classification', 'Confidence'].map((h, i) => (
                <th key={i} className="px-2 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-600 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(f => <FlowRow key={f.id} flow={f} />)}
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center font-mono text-xs text-zinc-400 dark:text-zinc-600">
                Awaiting traffic on monitored interface…
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────────────
function Header({ backendOnline, throughput, isSniffing, toggleSniffer, interfaces, selectedIface, setSelectedIface, hasLog, onAccount }) {
  const now = useLiveClock();
  const { user, logout, apiFetch } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const downloadLog = async () => {
    try {
      const res = await apiFetch(`/api/download_log`);
      if (!res.ok) throw new Error('download_failed');
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : 'capture.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Eroare la descărcarea log-ului:', err);
    }
  };

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/70">
      <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500/20 blur-md rounded" />
            <div className="relative h-9 w-9 rounded border border-cyan-500/40 bg-white dark:bg-zinc-950 flex items-center justify-center">
              <Shield className="h-4.5 w-4.5 text-cyan-500 dark:text-cyan-400" strokeWidth={1.5} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-sans text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                NIDS Live Monitor
              </h1>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400/80 border border-cyan-500/30 rounded-sm px-1.5 py-0.5">
                1D-CNN Engine
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-zinc-500 tracking-wide">
              Network Intrusion Detection · Real-time Packet Classification
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5 font-mono">

          <button
            onClick={toggleSniffer}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[11px] uppercase tracking-wider font-semibold transition-all border ${
              isSniffing
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
            }`}
          >
            {isSniffing ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
            {isSniffing ? 'Stop Capture' : 'Start Capture'}
          </button>

          {/* Download log: vizibil DOAR când capturarea e oprită și există un log */}
          {!isSniffing && hasLog && (
            <button
              type="button"
              onClick={downloadLog}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-[11px] uppercase tracking-wider font-semibold transition-all border bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20"
              title="Descarcă log-ul sesiunii anterioare (.csv)"
            >
              <Download className="h-3 w-3" />
              Download Log
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800 pl-5">
            <Network className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">IFACE</span>
            <select
              value={selectedIface}
              onChange={(e) => setSelectedIface(e.target.value)}
              disabled={isSniffing}
              className={`bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 rounded px-2 py-1 outline-none transition-colors ${
                isSniffing ? 'opacity-50 cursor-not-allowed' : 'hover:border-cyan-500 focus:border-cyan-500 cursor-pointer'
              }`}
            >
              {interfaces.map(iface => (
                <option key={iface} value={iface}>{iface}</option>
              ))}
            </select>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">RX</span>
            <span className="text-xs text-cyan-700 dark:text-cyan-300 tabular-nums">{throughput} Mbps</span>
          </div>

          <div className="flex items-center gap-2">
            <StatusDot online={backendOnline} />
            <span className="text-[10px] uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {backendOnline ? 'System Active' : 'Mock Mode'}
            </span>
          </div>

          <div className="flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800 pl-5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">UTC</span>
            <span className="text-sm text-zinc-900 dark:text-zinc-100 tabular-nums">
              {now.toISOString().slice(11, 19)}
            </span>
          </div>

          {/* Theme toggle */}
          <div className="flex items-center border-l border-zinc-200 dark:border-zinc-800 pl-5">
            <ThemeToggle />
          </div>

          {/* User menu */}
          <div className="relative border-l border-zinc-200 dark:border-zinc-800 pl-5">
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-2 px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 hover:border-cyan-500/60 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <UserIcon className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400" />
              <span className="text-xs text-zinc-800 dark:text-zinc-200">{user?.username}</span>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-[100]" onClick={() => setMenuOpen(false)} />
                <div className="fixed right-5 top-16 w-48 rounded border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 shadow-xl z-[101] overflow-hidden">
                  <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800/80">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Signed in as</div>
                    <div className="font-mono text-xs text-zinc-800 dark:text-zinc-200 truncate">{user?.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onAccount(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Setări cont</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors border-t border-zinc-200 dark:border-zinc-800/80"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function NIDSDashboard({ onAccount }) {
  const { feed, stats, timeline, backendOnline, isSniffing, toggleSniffer, interfaces, selectedIface, setSelectedIface, hasLog } = useNIDSData();

  return (
    <div className="min-h-screen w-full bg-zinc-50 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 font-sans relative overflow-hidden">
      {/* Style block: fonts + scan-grid background */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-sans { font-family: 'IBM Plex Sans', system-ui, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .custom-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #a1a1aa; border-radius: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #71717a; }
        .dark .custom-scroll::-webkit-scrollbar-thumb { background: #27272a; }
        .dark .custom-scroll::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
        .grid-bg {
          background-image:
            linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
            linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
          background-size: 32px 32px;
        }
      `}</style>

      {/* Background atmosphere */}
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-radial from-cyan-950/10 via-transparent to-transparent"
           style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(34,211,238,0.05), transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(244,63,94,0.04), transparent 50%)' }} />

      <div className="relative z-10">
        <Header backendOnline={backendOnline} throughput={stats.throughputMbps} isSniffing={isSniffing} toggleSniffer={toggleSniffer}
        interfaces={interfaces} selectedIface={selectedIface} setSelectedIface={setSelectedIface} hasLog={hasLog} onAccount={onAccount}/>

        <main className="p-4 lg:p-5 space-y-4 lg:space-y-5">
          {/* Banner when in mock mode */}
          {!backendOnline && (
            <div className="flex items-center gap-3 rounded border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 px-4 py-2 font-mono text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="text-amber-700/90 dark:text-amber-200/80">
                Backend offline — running on synthetic mock data. Start Flask API on
              </span>
              <code className="text-amber-800 dark:text-amber-100">{API_BASE}</code>
              <span className="text-amber-700/90 dark:text-amber-200/80">to stream live captures.</span>
            </div>
          )}

          {/* KPI Row */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <KpiCard
              icon={Activity}
              label="Packets Analyzed"
              value={fmt(stats.totalPackets)}
              sub={`${fmt(stats.totalFlows)} flows`}
              accent="cyan"
              trend={1}
            />
            <KpiCard
              icon={AlertTriangle}
              label="Critical Alerts"
              value={fmt(stats.criticalAlerts)}
              sub={`${stats.activeFlows} active connections`}
              accent="rose"
              trend={stats.criticalAlerts > 5 ? 1 : -1}
            />
            <KpiCard
              icon={Shield}
              label="Benign Traffic"
              value={`${stats.normalRatio.toFixed(1)}%`}
              sub="of last window"
              accent="emerald"
              trend={stats.normalRatio > 75 ? 1 : -1}
            />
            <KpiCard
              icon={Cpu}
              label="Model Confidence"
              value={`${stats.avgConfidence}%`}
              sub="softmax avg"
              accent="amber"
              trend={0}
            />
          </section>

          {/* Charts Row */}
          <section className="grid grid-cols-1 xl:grid-cols-5 gap-4 lg:gap-5">
            <div className="xl:col-span-3 rounded border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/40 overflow-hidden min-h-[340px] flex flex-col">
              <TrafficTimelineChart timeline={timeline} />
            </div>
            <div className="xl:col-span-2 rounded border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/40 overflow-hidden min-h-[340px] flex flex-col">
              <ClassDistributionChart distribution={stats.distribution} />
            </div>
          </section>

          {/* Live Feed */}
          <section className="rounded border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/40 overflow-hidden flex flex-col h-[520px]">
            <AlertFeed feed={feed} />
          </section>

          {/* Footer */}
          <footer className="flex items-center justify-between flex-wrap gap-2 pt-2 font-mono text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">
            <span>nids · 1d-cnn</span>
            <span>build 0.4.7</span>
          </footer>
        </main>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────────────────────
function AppRouter() {
  const { isAuthenticated, loading } = useAuth();
  const [page, setPage] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-zinc-50 text-zinc-500 dark:bg-zinc-950 flex items-center justify-center font-mono text-xs uppercase tracking-[0.2em]">
        Initializing…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (page === 'account') {
    return <AccountPage onBack={() => setPage('dashboard')} />;
  }

  return <NIDSDashboard onAccount={() => setPage('account')} />;
}


// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ThemeProvider>
  );
}
