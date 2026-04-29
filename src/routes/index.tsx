import { createFileRoute } from "@tanstack/react-router";
import App from "../tipsy/App";

export const Route = createFileRoute("/")({
  component: App,
});
