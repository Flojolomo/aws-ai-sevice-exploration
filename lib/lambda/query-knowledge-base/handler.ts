import * as env from "env-var";

const KNOWLEDGEBASE_ID = env.get("KNOWLEDGEBASE_ID").required().asString();
const MODEL_ARN = env.get("MODEL_ARN").required().asString();

import * as kbr from "@aws-sdk/client-bedrock-agent-runtime";

const bedrockClient = new kbr.BedrockAgentRuntimeClient({});

export const handler = async (event: unknown) => {
  console.info("Start processing event", { event });

  const retrieveParams: kbr.RetrieveCommandInput = {
    knowledgeBaseId: KNOWLEDGEBASE_ID,
    retrievalQuery: {
      text: (event as any).query,
    },
  };

  console.log("Sending retrieve command", retrieveParams);
  const response = await bedrockClient.send(
    new kbr.RetrieveCommand(retrieveParams)
  );
  console.log("Received response", response);

  const retrieveAndGenerateParams: kbr.RetrieveAndGenerateCommandInput = {
    // sessionId: "" // To keep context
    input: {
      text: (event as any).query,
    },
    retrieveAndGenerateConfiguration: {
      type: "KNOWLEDGE_BASE",
      knowledgeBaseConfiguration: {
        knowledgeBaseId: KNOWLEDGEBASE_ID,
        modelArn: MODEL_ARN,
      },
    },
  };

  console.log(
    "Sending retrieve and generate command",
    retrieveAndGenerateParams
  );
  const generatedResponse = await bedrockClient.send(
    new kbr.RetrieveAndGenerateCommand(retrieveAndGenerateParams)
  );

  console.log("Received response", generatedResponse);
  return {
    response,
    generatedResponse,
    output: generatedResponse.output,
  };
};
