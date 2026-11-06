import { createContext, useContext } from "react";
import type { Deployment } from "./config";

export const DeploymentContext = createContext<Deployment | null>(null);

/** The runtime deployment loaded from imd-deployment.json. */
export function useDeployment(): Deployment {
  const d = useContext(DeploymentContext);
  if (!d) throw new Error("Deployment not loaded");
  return d;
}
