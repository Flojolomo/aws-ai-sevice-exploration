import { Duration, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { LambdaFunction } from "./constructs/lambda-function";
import path = require("path");
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";

export class EventBridgeStack extends Stack {
  public constructor(scope: Construct, id: string) {
    super(scope, id);

    const { function: handler } = new LambdaFunction(this, "handler", {
      functionProps: {
        entry: path.join(
          __dirname,
          "lambda",
          "start-ingestion-job/start-sync.ts"
        ),
      },
    });

    const rule = new events.Rule(this, "cron-job", {
      schedule: events.Schedule.rate(Duration.minutes(1)),
    });

    rule.addTarget(
      new targets.LambdaFunction(handler, {
        event: events.RuleTargetInput.fromObject({
          knowledgeBaseId: "knowledgeBase",
          dataSourceId: "dataSource",
        }),
      })
    );
  }
}
