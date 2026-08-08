import type { HorizonApi } from "./HorizonApi";
import { httpClient } from "./httpClient";
import { mockClient } from "./mockClient";

const useMocks = import.meta.env.VITE_USE_MOCKS === "true";

export const api: HorizonApi = useMocks ? mockClient : httpClient;
export const usingMocks = useMocks;

export { ApiError } from "./errors";
export { authStore } from "./authStore";
export type { HorizonApi } from "./HorizonApi";
