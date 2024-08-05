import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { TextProcessing } from "./constructs/text-processing";
import { Rag } from "./constructs/rag";
import { SelfDestruct } from "cdk-self-destruct";

export class AiDemoCasesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new Rag(this, "rag");
    new TextProcessing(this, "text-processing");

    new SelfDestruct(this, "SelfDestruct", {
      defaultBehavior: {
        destoryAllResources: true,
        purgeResourceDependencies: true,
      },
      trigger: {
        scheduled: {
          afterDuration: cdk.Duration.hours(2),
          enabled: true,
        },
      },
    });
  }
}
