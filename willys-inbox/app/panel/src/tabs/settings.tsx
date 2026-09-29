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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTheme, THEME_DEFAULTS, WILLYS_RED } from "@/theme";
import type {
  AppStateData,
  AiConfigInfo,
  AiConfigPatch,
  AiProviderId,
  DebugInfo,
  StoreInfo,
  TodoEntityInfo,
} from "@/types";
import type { Notify } from "@/hooks";

export function SettingsTab({
  state,
  reload,
  notify,
}: {
  state: AppStateData;
  reload: () => void;
  notify: Notify;
}) {
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [storeFilter, setStoreFilter] = useState("");
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [theme, setTheme] = useTheme();
  const [ai, setAi] = useState<AiConfigInfo | null>(null);
  const [newProvider, setNewProvider] = useState<AiProviderId>("opencode");
  const [newKey, setNewKey] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newModel, setNewModel] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string>("");
  const [todoEntities, setTodoEntities] = useState<{ entities: TodoEntityInfo[] } | null>(null);
  const [currentTodo, setCurrentTodo] = useState<{ current: string } | null>(null);
  const [selectedTodo, setSelectedTodo] = useState("");
  const [todoError, setTodoError] = useState("");
  const [dealMode, setDealMode] = useState<"ask" | "add">("ask");
  const [selectedStore, setSelectedStore] = useState("");
  const [confirmConnector, setConfirmConnector] = useState<string | null>(null);

  useMemo(() => {
    void api
      .stores()
      .then((d) => setStores(d.stores ?? []))
      .catch(() => undefined);
    void api.aiConfig().then(setAi).catch(() => undefined);
    void api
      .todoEntities()
      .then((d) => {
        setTodoEntities({ entities: d.entities });
        setCurrentTodo(d);
      })
      .catch(() => setTodoEntities(null));
    void api.panelSettings().then((d) => setDealMode(d.dealComposeMode)).catch(() => undefined);
  }, []);

  const newProviderInfo = ai?.providers.find((p) => p.id === newProvider);
  const usingCustomUrl = newProvider === "custom";
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

  const runPredict = (): void => {
    void api
      .runJob("predict")
      .then(() => {
        notify("Prediktion körd – nya förslag kan ha skapats");
        reload();
      })
      .catch((e: Error) => notify(e.message));
  };

  const addConnector = async (): Promise<void> => {
    setAiBusy(true);
    try {
      const patch: AiConfigPatch = { provider: newProvider };
      if (newKey.trim()) patch.apiKey = newKey.trim();
      if (newUrl.trim()) patch.baseUrl = newUrl.trim();
      if (newModel.trim()) patch.model = newModel.trim();
      const cfg = await api.saveAiConnector(patch);
      setAi(cfg);
      setNewKey("");
      setNewUrl("");
      setNewModel("");
      notify("AI-anslutning tillagd");
    } catch (e) {
      notify(`Fel: ${(e as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  };

  const removeConnector = (id: string): void => {
    void api
      .deleteAiConnector(id)
      .then((cfg) => {
        setAi(cfg);
        notify("AI-anslutning borttagen");
      })
      .catch((e: Error) => notify(e.message));
  };

  const moveConnector = (id: string, dir: -1 | 1): void => {
    if (!ai) return;
    const ids = ai.connectors.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void api.reorderAiConnectors(ids).then(setAi);
  };

  const testConnector = (id: string): void => {
    setTestingId(id);
    setTestResult("");
    void api
      .testAiConnector(id)
      .then((r) => setTestResult(r.ok ? `OK: ${r.model} (${r.latencyMs} ms)` : `Fel: ${r.error}`))
      .catch((e: Error) => setTestResult(`Fel: ${e.message}`))
      .finally(() => setTestingId(null));
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

  const applyStore = (): void => {
    if (!selectedStore) return;
    void api
      .setStore(selectedStore)
      .then((d) => {
        notify(`Butik: ${d.storeId}`);
        reload();
      })
      .catch((e: Error) => notify(e.message));
  };

  const providerLabel = (id: string): string =>
    ai?.providers.find((p) => p.id === id)?.label ?? id;

  return (
    <div className="flex flex-col gap-2">
      <Card className="py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Utseende</h2>
        <div className="flex flex-wrap items-center gap-3 mt-1">
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
        <p className="text-muted-foreground text-sm">
          Standard: Willys-röd ({WILLYS_RED}) på vitt. Valen sparas i webbläsaren.
        </p>
      </Card>

      <Card className="py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">AI-assistenter</h2>
        <p className="text-muted-foreground text-sm">
          {ai?.configured
            ? "Anslutningarna används i tur och ordning uppifrån och ner – misslyckas en tas nästa automatiskt."
            : "Ingen anslutning konfigurerad. Används för: smart matchning av incheckade varor och naturligt språk-lägg-till."}
        </p>

        {ai && ai.connectors.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-1">
            {ai.connectors.map((c, idx) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                <div className="flex-1 min-w-40">
                  <span className="text-sm font-medium">{providerLabel(c.provider)}</span>
                  <div className="text-xs text-muted-foreground">
                    {c.model} · {c.baseUrl}
                    {c.apiKeyHint && ` · nyckel ${c.apiKeyHint}`}
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={testingId === c.id} onClick={() => testConnector(c.id)}>
                  {testingId === c.id ? "…" : "Testa"}
                </Button>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={idx === 0} onClick={() => moveConnector(c.id, -1)}>
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={idx === ai.connectors.length - 1}
                    onClick={() => moveConnector(c.id, 1)}
                  >
                    ↓
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmConnector(c.id)}>
                    Ta bort
                  </Button>
                </div>
                {testResult && testingId === null && testResult.startsWith("Fel") && (
                  <span className="hidden" />
                )}
              </div>
            ))}
            {testResult && (
              <p className={`text-sm px-2 ${testResult.startsWith("OK") ? "text-muted-foreground" : "text-primary"}`}>
                {testResult}
              </p>
            )}
          </div>
        )}

        <h3 className="text-sm font-semibold mt-2">Lägg till anslutning</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={newProvider} onValueChange={(v) => setNewProvider(v as AiProviderId)}>
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
          <Input
            type="password"
            placeholder="API-nyckel"
            className="flex-1 min-w-44"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          {usingCustomUrl && (
            <Input
              placeholder="Bas-URL (t.ex. http://localhost:11434/v1)"
              className="flex-1 min-w-52"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          )}
          <Input
            placeholder={newProviderInfo?.defaultModel || "modell-id"}
            className="w-52"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
          />
          <Button disabled={aiBusy} onClick={() => void addConnector()}>
            Lägg till
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {newProviderInfo && !usingCustomUrl
            ? `Förval: ${newProviderInfo.baseUrl} · modell ${newProviderInfo.defaultModel}. Fält du lämnar tomma använder förvalen.`
            : "Ange bas-URL till en OpenAI-kompatibel server (…/v1) och modell-id."}
        </p>
      </Card>

      <Card className="py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Komponering</h2>
        <label className="flex items-center gap-2 cursor-pointer">
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
        <p className="text-muted-foreground text-sm">
          Av: rea-träffar från bevakningslistan kommer som förslag du godkänner. På: de hamnar direkt på listan (i gångordning).
        </p>
      </Card>

      <Card className="py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Inköpslista</h2>
        <p className="text-muted-foreground text-sm">
          Listan läggs i: <b>{currentTodo?.current ?? "todo.shopping_list"}</b>. Välj bland de to-do-listor som finns i din HA:
        </p>
        {todoEntities ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
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
            {todoError && <p className="text-primary text-sm">{todoError}</p>}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Kunde inte hämta to-do-listor.</p>
        )}
      </Card>

      <Card className="py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Butik</h2>
        <p className="text-muted-foreground text-sm">
          Aktiv butik: <b>{state.storeId || "hemmabutik från kontot"}</b>. Byt butik direkt här:
        </p>
        <Input
          type="search"
          placeholder="Filtrera butiker …"
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
        />
        <div className="max-h-72 overflow-y-auto flex flex-col gap-2">
          {filtered.map((s) => (
            <Card key={s.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-40">
                  <span className="font-semibold text-sm">{s.name}</span>
                  <div className="text-muted-foreground text-sm">
                    {s.address ?? ""} {s.city ?? ""}
                  </div>
                </div>
                <span className="text-xs bg-secondary text-secondary-foreground rounded-md px-2 py-0.5">ID {s.id}</span>
                <Button
                  size="sm"
                  variant={state.storeId === s.id ? "default" : "outline"}
                  onClick={() => {
                    setSelectedStore(s.id);
                    void api
                      .setStore(s.id)
                      .then((d) => {
                        notify(`Butik: ${s.name}`);
                        reload();
                      })
                      .catch((e: Error) => notify(e.message));
                  }}
                >
                  {state.storeId === s.id ? "✓ Aktiv" : "Använd"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
        {selectedStore && <p className="hidden">{selectedStore}</p>}
      </Card>

      <Card className="py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Underhåll</h2>
        <p className="text-muted-foreground text-sm">Kör de schemalagda jobben när du vill:</p>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" onClick={refreshDeals}>
            Uppdatera reor
          </Button>
          <Button variant="secondary" onClick={runPredict}>
            Kör prediktion nu
          </Button>
          <Button onClick={compose}>Komponera lista nu</Button>
        </div>
      </Card>

      <Card className="py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Diagnostik</h2>
        <div className="flex flex-wrap items-center gap-2">
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
          <pre className="overflow-x-auto bg-secondary rounded-md p-2.5 text-xs">{JSON.stringify(debug, null, 2)}</pre>
        )}
      </Card>

      <AlertDialog open={confirmConnector !== null} onOpenChange={(o) => !o && setConfirmConnector(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort AI-anslutning?</AlertDialogTitle>
            <AlertDialogDescription>
              Anslutningen tas bort ur kedjan. Du kan lägga till den igen senare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmConnector) removeConnector(confirmConnector);
                setConfirmConnector(null);
              }}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
