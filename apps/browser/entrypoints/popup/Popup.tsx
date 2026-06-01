import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Separator,
  Switch,
} from "@keel/ui";
import { shields } from "@/modules/shields/registry";
import { signals } from "@/modules/signals/registry";
import { shieldEnabled, signalEnabled, domainCooldown } from "@/utils/storage";

// ── Intervention model (shields + signals, unified for rendering) ──

type BoolStore = ReturnType<typeof shieldEnabled>;

type Intervention = {
  id: string;
  name: string;
  description: string;
  domain: string;
  icon: string;
  kind: "shield" | "signal";
  getStore: () => BoolStore;
};

const allInterventions: Intervention[] = [
  ...shields.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    domain: s.domain,
    icon: s.icon,
    kind: "shield" as const,
    getStore: () => shieldEnabled(s.id, s.defaultEnabled),
  })),
  ...signals.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    domain: s.domain,
    icon: s.icon,
    kind: "signal" as const,
    getStore: () => signalEnabled(s.id, s.defaultEnabled),
  })),
];

const COOLDOWN_OPTIONS = [
  { label: "5m", seconds: 5 * 60 },
  { label: "10m", seconds: 10 * 60 },
  { label: "15m", seconds: 15 * 60 },
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "1d", seconds: 24 * 60 * 60 },
  { label: "3d", seconds: 3 * 24 * 60 * 60 },
  { label: "7d", seconds: 7 * 24 * 60 * 60 },
];

const COOLDOWN_DOMAINS = ["chess.com", "youtube.com", "linkedin.com"];

type DomainGroup = { domain: string; interventions: Intervention[] };

function groupByDomain(items: Intervention[]): DomainGroup[] {
  const map = new Map<string, Intervention[]>();
  for (const item of items) {
    const arr = map.get(item.domain) ?? [];
    arr.push(item);
    map.set(item.domain, arr);
  }
  return [...map.entries()].map(([domain, interventions]) => ({
    domain,
    interventions,
  }));
}

function formatTime(seconds: number): string {
  if (seconds <= 0) {
    return "0s";
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) {
    parts.push(`${d}d`);
  }
  if (h > 0) {
    parts.push(`${h}h`);
  }
  if (m > 0) {
    parts.push(`${m}m`);
  }
  if (s > 0 || parts.length === 0) {
    parts.push(`${s}s`);
  }
  return parts.join(" ");
}

// ── Hooks ─────────────────────────────────────────────────────────

function useCurrentDomain(): string | null {
  const [domain, setDomain] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (!alive) {
          return;
        }
        if (tab?.url) {
          setDomain(new URL(tab.url).hostname.replace(/^www\./, ""));
        } else {
          setDomain("");
        }
      })
      .catch(() => {
        if (alive) {
          setDomain("");
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  return domain;
}

/** Subscribe to a fixed list of boolean storage items (count stable across renders). */
function useBoolStores(stores: BoolStore[]) {
  const [values, setValues] = useState<boolean[]>(() => stores.map(() => false));
  useEffect(() => {
    let alive = true;
    Promise.all(stores.map((s) => s.getValue())).then((vs) => {
      if (alive) {
        setValues(vs);
      }
    });
    const unwatchers = stores.map((s, i) =>
      s.watch((v) =>
        setValues((prev) => {
          const next = [...prev];
          next[i] = v;
          return next;
        })
      )
    );
    return () => {
      alive = false;
      for (const u of unwatchers) {
        u();
      }
    };
  }, [stores]);

  const setOne = (i: number, v: boolean) => {
    setValues((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    void stores[i].setValue(v);
  };
  const setAll = (v: boolean) => {
    setValues(stores.map(() => v));
    for (const s of stores) {
      void s.setValue(v);
    }
  };
  return { values, setOne, setAll };
}

// ── Components ────────────────────────────────────────────────────

function CooldownCard({ domain }: { domain: string }) {
  const matched = COOLDOWN_DOMAINS.find((d) => domain.includes(d));
  const store = useMemo(
    () => (matched ? domainCooldown(matched) : null),
    [matched]
  );
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!store) {
      return;
    }
    let alive = true;
    store.getValue().then((v) => {
      if (alive) {
        setUntil(v);
      }
    });
    const unwatch = store.watch((v) => setUntil(v));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      unwatch();
      clearInterval(tick);
    };
  }, [store]);

  if (!store) {
    return null;
  }

  const active = until > now;
  const remaining = active ? Math.ceil((until - now) / 1000) : 0;

  return (
    <Card className={active ? "border-primary py-3 gap-3" : "py-3 gap-3"}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">⏸</span>
          <span className="flex-1 text-sm font-semibold text-muted-foreground">
            Cooldown
          </span>
          {active && (
            <span className="font-mono text-sm font-semibold text-primary">
              {formatTime(remaining)}
            </span>
          )}
        </div>
        {active ? (
          <span className="text-xs text-muted-foreground">
            Cooldown active — take a break.
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {COOLDOWN_OPTIONS.map((opt) => (
              <Button
                key={opt.label}
                variant="outline"
                size="sm"
                onClick={() => {
                  void store.setValue(Date.now() + opt.seconds * 1000);
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DomainGroupCard({ group }: { group: DomainGroup }) {
  const stores = useMemo(
    () => group.interventions.map((i) => i.getStore()),
    [group]
  );
  const { values, setOne, setAll } = useBoolStores(stores);
  const enabledCount = values.filter(Boolean).length;
  const allActive = enabledCount === values.length;

  return (
    <Card className="py-3 gap-3">
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold lowercase text-muted-foreground">
              {group.domain}
            </span>
            <Badge variant={allActive ? "default" : "secondary"}>
              {enabledCount}/{values.length}
            </Badge>
          </div>
          <Switch
            checked={allActive}
            onCheckedChange={(v) => setAll(v)}
            aria-label={`Toggle all ${group.domain} interventions`}
          />
        </div>
        {group.interventions.map((intervention, i) => (
          <div
            key={intervention.id}
            className="flex items-center justify-between border-l-2 border-border pl-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">
                  {intervention.icon} {intervention.name}
                </span>
                {intervention.kind === "signal" && (
                  <Badge variant="outline" className="text-[9px]">
                    signal
                  </Badge>
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {intervention.description}
              </span>
            </div>
            <Switch
              checked={values[i] ?? false}
              onCheckedChange={(v) => setOne(i, v)}
              aria-label={`Toggle ${intervention.name}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function Popup() {
  const domain = useCurrentDomain();

  const matchingGroups = useMemo(() => {
    if (!domain) {
      return [];
    }
    return groupByDomain(allInterventions).filter((g) =>
      domain.includes(g.domain)
    );
  }, [domain]);

  const openManage = () => {
    browser.tabs.create({ url: browser.runtime.getURL("/manage.html") });
    window.close();
  };

  return (
    <div className="flex flex-col gap-3 p-5">
      <header className="text-center">
        <h1 className="text-base font-semibold tracking-tight">keel</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Stopping cues for the internet
        </p>
      </header>

      {domain && <CooldownCard domain={domain} />}

      {domain === null ? null : matchingGroups.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {domain
            ? `No interventions for ${domain}`
            : "Navigate to a site to see interventions"}
        </p>
      ) : (
        matchingGroups.map((group) => (
          <DomainGroupCard key={group.domain} group={group} />
        ))
      )}

      <Separator />
      <footer className="text-center">
        <Button variant="link" size="sm" onClick={openManage}>
          Manage all interventions →
        </Button>
      </footer>
    </div>
  );
}
