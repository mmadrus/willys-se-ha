import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppData, useToast } from "@/hooks";
import { applyTheme, loadTheme } from "@/theme";
import { ListTab } from "@/tabs/list";
import { SearchTab } from "@/tabs/search";
import { ItemsTab } from "@/tabs/items";
import { AislesTab } from "@/tabs/aisles";
import { DealsTab } from "@/tabs/deals";
import { SettingsTab } from "@/tabs/settings";

export function App(): React.JSX.Element {
  const { state, error, reload } = useAppData();
  const { toast, notify } = useToast();

  useEffect(() => {
    applyTheme(loadTheme());
  }, []);

  if (error && !state) {
    return <p className="text-center text-muted-foreground py-16">Kunde inte nå servern: {error}</p>;
  }
  if (!state) return <p className="text-center text-muted-foreground py-16">Laddar …</p>;

  const pending = state.suggestions.filter((s) => s.status === "pending");

  return (
    <>
      <h1 className="text-xl font-bold mt-2 mb-1">My Willys List</h1>
      <div className="flex flex-wrap items-center gap-3 px-0.5 py-1 text-[13px] text-muted-foreground">
        <span>
          <span className={`inline-block size-2.5 rounded-full ${state.dealsUpdated ? "bg-primary" : "bg-muted-foreground"}`} />
        </span>
        <span>
          Butik: <b className="text-foreground">{state.storeId || "—"}</b>
        </span>
        <span>
          På listan väntar: <b className="text-foreground">{pending.length}</b>
        </span>
        {state.lastComposeAt && (
          <span>Senaste komp: {new Date(state.lastComposeAt).toLocaleString("sv-SE")}</span>
        )}
      </div>
      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="sok">Sök</TabsTrigger>
          <TabsTrigger value="varor">Varor ({state.items.length})</TabsTrigger>
          <TabsTrigger value="gang">Gångordning</TabsTrigger>
          <TabsTrigger value="reor">Reor</TabsTrigger>
          <TabsTrigger value="inst">Inställningar</TabsTrigger>
        </TabsList>
        <TabsContent value="lista">
          <ListTab state={state} reload={reload} notify={notify} />
        </TabsContent>
        <TabsContent value="sok">
          <SearchTab state={state} reload={reload} notify={notify} />
        </TabsContent>
        <TabsContent value="varor">
          <ItemsTab state={state} reload={reload} notify={notify} />
        </TabsContent>
        <TabsContent value="gang">
          <AislesTab state={state} reload={reload} notify={notify} />
        </TabsContent>
        <TabsContent value="reor">
          <DealsTab state={state} reload={reload} notify={notify} />
        </TabsContent>
        <TabsContent value="inst">
          <SettingsTab state={state} reload={reload} notify={notify} />
        </TabsContent>
      </Tabs>
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
