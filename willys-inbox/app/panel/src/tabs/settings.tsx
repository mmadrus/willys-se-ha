import { useMemo, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme, THEME_DEFAULTS, WILLYS_RED } from "@/theme";
import type { AppStateData, AiConfigInfo, AiConfigPatch, DebugInfo, StoreInfo, TodoEntityInfo } from "@/types";
import type { Notify } from "@/hooks";

export function SettingsTab({ state, reload, notify }: { state: AppStateData; reload: () => void; notify: Notify }) {
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [storeFilter, setStoreFilter] = useState("");
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [theme, setTheme] = useTheme();
  const [ai, setAi] = useState<AiConfigInfo | null>(null);
  const [aiProvider, setAiProvider] = useState<AiConfigInfo["provider"] | "">("");
  const [aiKey, setAiKey] = useState("");
  const [aiUrl, setAiUrl] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [todoEntities, setTodoEntities] = useState<{ entities: TodoEntityInfo[] } | null>(null);
  const [currentTodo, setCurrentTodo] = useState<{ current: string } | null>(null);
  const [selectedTodo, setSelectedTodo] = useState("");
  const [todoError, setTodoError] = useState("");
  const [dealMode, setDealMode] = useState<"ask" | "add">("ask");

  useMemo(() => {
    void api
      .stores()
      .then((d) => setStores(d.stores ?? []))
      .catch(() => undefined);
    void api
      .aiConfig()
      .then((c) => {
        setAi(c);
        setAiProvider(c.provider);
      })
      .catch(() => undefined);
    void api
      .todoEntities()
      .then((d) => {
        setTodoEntities({ entities: d.entities });
        setCurrentTodo(d);
      })
      .catch(() => setTodoEntities(null));
    void api.panelSettings().then((d) => setDealMode(d.dealComposeMode)).catch(() => undefined);
  }, []);

  const providerInfo = ai?.providers.find((p) => p.id === (aiProvider || ai?.provider));
  const usingCustomUrl = aiProvider === "custom";
  const filtered = stores.filter(
    (s) => !storeFilter || s.name.toLowerCase().includes(storeFilter.toLowerCase()),
  );

  const refreshDeals = (): void => {
    void api
      .refresh()
      .then(() => {
        notify("Reor uppdaterade");
        reload();
      })
      .catch((e: Error) => notify(e.message));
  };

  const compose = (): void => {
    void api
      .compose(true)
      .then((r) => {
        notify(`La till ${r.added} varor`);
        reload();
      })
      .catch((e: Error) => notify(e.message));
  };

  const saveAi = async (): Promise<void> => {
    setAiBusy(true);
    try {
      const patch: AiConfigPatch = {};
      if (aiProvider) patch.provider = aiProvider;
      if (aiKey.trim()) patch.apiKey = aiKey.trim();
      if (aiUrl.trim()) patch.baseUrl = aiUrl.trim();
      if (aiModel.trim()) patch.model = aiModel.trim();
      const cfg = await api.saveAiConfig(patch);
      setAi(cfg);
      setAiProvider(cfg.provider);
      setAiKey("");
      setAiUrl("");
      setAiModel("");
      notify("AI-inställningar sparade");
    } catch (e) {
      notify(`Fel: ${(e as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  };

  const testAi = (): void => {
    setAiBusy(true);
    void api
      .aiTest()
      .then((r) => notify(r.ok ? `AI OK (${r.model}, ${r.latencyMs} ms)` : `AI-fel: ${r.error}`))
      .catch((e: Error) => notify(`Fel: ${e.message}`))
      .finally(() => setAiBusy(false));
  };

  const saveTodo = async (): Promise<void> => {
    if (!selectedTodo) return;
    setTodoError("");
    try {
      const d = await api.setTodoEntity(selectedTodo);
      setCurrentTodo(d);
      notify(`Inköpslista: ${d.current}`);
    } catch (e) {
      const msg = (e as Error).message;
      setTodoError(msg);
      notify(msg);
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card className="py-3 gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </Card>
  );

  return (
    <div className="flex flex-col gap-2">
      <Section title="Utseende">
        <div className="flex flex-wrap items-center gap-3 px-1">
          <Button
            variant={theme.mode === "light" ? "default" : "outline"}
            onClick={() => setTheme({ ...theme, mode: "light" })}
          >
            Ljust
          </Button>
          <Button
            variant={theme.mode === "dark" ? "default" : "outline"}
            onClick={() => setTheme({ ...theme, mode: "dark" })}
          >
            Mörkt
          </Button>
          <Label className="flex items-center gap-2 text-muted-foreground">
            Accentfärg:
            <input
              type="color"
              className="size-8 rounded-md border border-border bg-background cursor-pointer"
              value={theme.accent ?? THEME_DEFAULTS[theme.mode].accent}
              onChange={(e) => setTheme({ ...theme, accent: e.target.value })}
            />
          </Label>
          <Label className="flex items-center gap-2 text-muted-foreground">
            Bakgrund:
            <input
              type="color"
              className="size-8 rounded-md border border-border bg-background cursor-pointer"
              value={theme.bg ?? THEME_DEFAULTS[theme.mode].bg}
              onChange={(e) => setTheme({ ...theme, bg: e.target.value })}
            />
          </Label>
          <Button size="sm" variant="ghost" onClick={() => setTheme({ mode: theme.mode, accent: null, bg: null })}>
            Återställ
          </Button>
        </div>
        <p className="text-muted-foreground text-sm px-1">
          Standard: Willys-röd ({WILLYS_RED}) på vitt. Valen sparas i webbläsaren.
        </p>
      </Section>

      <Section title="AI-assistent">
        <p className="text-muted-foreground text-sm px-1">
          {ai?.configured ? (
            <>
              Aktiv: <b>{ai.model}</b> via {ai.baseUrl} (nyckel {ai.apiKeyHint})
            </>
          ) : (
            "Inte konfigurerad. Används för: smart matchning av incheckade varor och naturligt språk-lägg-till."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-sm text-muted-foreground">Leverantör:</span>
          <Select value={aiProvider || ai?.provider || "opencode"} onValueChange={(v) => setAiProvider(v as AiConfigInfo["provider"])}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(ai?.providers ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <Input
            type="password"
            placeholder="API-nyckel"
            className="flex-1 min-w-44"
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
          />
          {usingCustomUrl && (
            <Input
              placeholder="Bas-URL (t.ex. http://localhost:11434/v1)"
              className="flex-1 min-w-52"
              value={aiUrl}
              onChange={(e) => setAiUrl(e.target.value)}
            />
          )}
          <Input
            placeholder={providerInfo?.defaultModel || ai?.model || "modell-id"}
            className="w-52"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
          />
        </div>
        <p className="text-muted-foreground text-xs px-1">
          {providerInfo && !usingCustomUrl
            ? `Förval: ${providerInfo.baseUrl} · modell ${providerInfo.defaultModel}. Fält du lämnar tomma använder förvalen.`
            : "Ange bas-URL till en OpenAI-kompatibel server (…/v1) och modell-id."}
        </p>
        <div className="flex flex-wrap gap-1.5 px-1">
          <Button disabled={aiBusy} onClick={() => void saveAi()}>
            Spara
          </Button>
          <Button variant="secondary" disabled={aiBusy} onClick={() => void testAi()}>
            Testa anslutning
          </Button>
        </div>
      </Section>

      <Section title="Komponering">
        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <Checkbox
            checked={dealMode === "add"}
            onCheckedChange={(v) => {
              const mode = v === true ? "add" : "ask";
              setDealMode(mode);
              void api
                .setPanelSettings({ dealComposeMode: mode })
                .then(() => notify(mode === "add" ? "Reor läggs direkt på listan" : "Reor kommer som förslag"));
            }}
          />
          <span className="text-sm">Lägg rea-varor direkt på inköpslistan vid komponering</span>
        </label>
        <p className="text-muted-foreground text-sm px-1">
          Av: rea-träffar från bevakningslistan kommer som förslag du godkänner. På: de hamnar direkt på listan (i gångordning).
        </p>
      </Section>

      <Section title="Inköpslista">
        <p className="text-muted-foreground text-sm px-1">
          Listan läggs i: <b>{currentTodo?.current ?? "todo.shopping_list"}</b>. Välj bland de to-do-listor som finns i din HA:
        </p>
        {todoEntities ? (
          <>
            <div className="flex flex-wrap items-center gap-2 px-1">
              <Select value={selectedTodo} onValueChange={setSelectedTodo}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="(välj lista)" />
                </SelectTrigger>
                <SelectContent>
                  {todoEntities.entities.map((t) => (
                    <SelectItem key={t.entity_id} value={t.entity_id}>
                      {t.name} ({t.entity_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void saveTodo()}>Spara lista</Button>
            </div>
            {todoError && <p className="text-primary text-sm px-1">{todoError}</p>}
          </>
        ) : (
          <p className="text-muted-foreground text-sm px-1 py-1">Kunde inte hämta to-do-listor.</p>
        )}
      </Section>

      <Section title="Butik">
        <p className="text-muted-foreground text-sm px-1">
          Aktiv butik: <b>{state.storeId || "hemmabutik från kontot"}</b>. Byt butik via add-ons inställningar med butikens ID:
        </p>
        <Input
          type="search"
          placeholder="Filtrera butiker …"
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
        />
        <div className="max-h-72 overflow-y-auto flex flex-col gap-2">
          {filtered.map((s) => (
            <Card key={s.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2 px-1">
                <div className="flex-1">
                  <span className="font-semibold text-sm">{s.name}</span>
                  <div className="text-muted-foreground text-sm">
                    {s.address ?? ""} {s.city ?? ""}
                  </div>
                </div>
                <span className="text-xs bg-secondary text-secondary-foreground rounded-md px-2 py-0.5">ID {s.id}</span>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Underhåll">
        <div className="flex flex-wrap gap-1.5 px-1">
          <Button variant="secondary" onClick={refreshDeals}>
            Uppdatera reor nu
          </Button>
          <Button onClick={compose}>Komponera lista nu</Button>
        </div>
      </Section>

      <Section title="Diagnostik">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <p className="flex-1 text-sm text-muted-foreground min-w-48">
            Visar API-behörigheter och miljövariabler (värden visas aldrig).
          </p>
          <Button
            variant="secondary"
            onClick={() => api.debug().then(setDebug).catch((e: Error) => setDebug({ error: e.message }))}
          >
            Kör diagnostik
          </Button>
        </div>
        {debug && (
          <pre className="overflow-x-auto bg-secondary rounded-md p-2.5 mx-1 text-xs">{JSON.stringify(debug, null, 2)}</pre>
        )}
      </Section>
    </div>
  );
}
