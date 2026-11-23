import Clarity from "@microsoft/clarity";
import { useEffect } from "react";

// Public Clarity project id; it ships in the client bundle either way.
const PROJECT_ID = "zi4yy05b7q";

export function useClarity() {
  useEffect(() => {
    Clarity.init(PROJECT_ID);
  }, []);
}
