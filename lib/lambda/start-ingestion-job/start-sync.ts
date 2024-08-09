import {
  AsyncHandler,
  LambdaInterface,
  SyncHandler,
} from "@aws-lambda-powertools/commons/types";
import { Logger } from "@aws-lambda-powertools/logger";
import { parser } from "@aws-lambda-powertools/parser";
import {
  BedrockAgent,
  StartIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";
import { BedrockAgentRuntime } from "@aws-sdk/client-bedrock-agent-runtime";
import { Context, Handler } from "aws-lambda";
import { z } from "zod";

const bedrockClient = new BedrockAgent();

const logger = new Logger();

const startIngestionJobEventSchema = z.object({
  knowledgeBaseId: z.string(),
  dataSourceId: z.string(),
});

export type StartIngestionJobEvent = z.infer<
  typeof startIngestionJobEventSchema
>;

class Lambda implements LambdaInterface {
  @parser({ schema: startIngestionJobEventSchema })
  public async handler(
    event: StartIngestionJobEvent,
    context: Context
  ): Promise<any> {
    console.log("Received event: ", JSON.stringify(event, null, 2));

    await bedrockClient.startIngestionJob({
      knowledgeBaseId: event.knowledgeBaseId,
      dataSourceId: event.dataSourceId,
    });
  }
}

const myFunction = new Lambda();
export const handler = myFunction.handler.bind(myFunction);
