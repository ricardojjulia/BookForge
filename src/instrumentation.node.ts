import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { OpenAIInstrumentation } from "@arizeai/openinference-instrumentation-openai";
import OpenAI from "openai";

const projectName = process.env.ARIZE_PROJECT_NAME ?? "book-forge-arize-tracing";

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: projectName,
    [SEMRESATTRS_PROJECT_NAME]: projectName,
  }),
  spanProcessors: [
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: "https://otlp.arize.com/v1/traces",
        headers: {
          "arize-space-id": process.env.ARIZE_SPACE_ID ?? "",
          "arize-api-key": process.env.ARIZE_API_KEY ?? "",
        },
      }),
    ),
  ],
});

provider.register();

const instrumentation = new OpenAIInstrumentation();
instrumentation.manuallyInstrument(OpenAI);

registerInstrumentations({ instrumentations: [instrumentation] });
