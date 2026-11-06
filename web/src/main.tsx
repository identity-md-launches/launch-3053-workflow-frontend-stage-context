import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { loadDeployment } from "./config";
import { DeploymentContext } from "./deployment";
import { App } from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: true } } });

loadDeployment()
  .then((dep) => {
    root.render(
      <StrictMode>
        <DeploymentContext.Provider value={dep}>
          <WagmiProvider config={dep.wagmi}>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </WagmiProvider>
        </DeploymentContext.Provider>
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    root.render(
      <main className="shell boot-error">
        <h1>SqueekBoard could not start</h1>
        <p>{err instanceof Error ? err.message : String(err)}</p>
        <p>Reload the page. If it keeps failing, the deployment file beside this page is missing or damaged.</p>
      </main>,
    );
  });
