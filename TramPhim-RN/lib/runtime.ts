import Constants, { ExecutionEnvironment } from "expo-constants";

export function isExpoGoRuntime() {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}
