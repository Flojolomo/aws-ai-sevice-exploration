import { Construct } from "constructs";
import { LambdaFunction } from "./lambda-function";
import path = require("path");
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as cdk from "aws-cdk-lib";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";

interface RagTestProps {
  knowledgeBase: bedrock.CfnKnowledgeBase;
  generativeModelId: string;
}

export class RagTest extends Construct {
  public readonly testFunction: nodejs.NodejsFunction;

  public constructor(scope: Construct, id: string, props: RagTestProps) {
    super(scope, id);

    const knowledgeBaseId = props.knowledgeBase
      .getAtt("KnowledgeBaseId")
      .toString();

    const knowledgeBaseArn = props.knowledgeBase
      .getAtt("KnowledgeBaseArn")
      .toString();

    const generativeModelArn = `arn:aws:bedrock:${
      cdk.Stack.of(this).region
    }::foundation-model/${props.generativeModelId}`;

    this.testFunction = this.createLambda({
      generativeModelArn,
      knowledgeBaseId,
    });
    this.testFunction.role?.addManagedPolicy(
      this.createManagedPolicy({ generativeModelArn, knowledgeBaseArn })
    );
  }

  private createLambda({
    knowledgeBaseId,
    generativeModelArn,
  }: {
    knowledgeBaseId: string;
    generativeModelArn: string;
  }): nodejs.NodejsFunction {
    const { function: testFunction } = new LambdaFunction(
      this,
      "test-knowledgebase-function",
      {
        functionProps: {
          entry: path.join(
            __dirname,
            "..",
            "lambda/query-knowledge-base/handler.ts"
          ),
          environment: {
            MODEL_ARN: generativeModelArn,
            KNOWLEDGEBASE_ID: knowledgeBaseId,
          },
          timeout: cdk.Duration.seconds(30),
        },
      }
    );

    new cdk.CfnOutput(this, "test-knowledgebase-function-name", {
      value: testFunction.functionName,
    });

    return testFunction;
  }

  private createManagedPolicy({
    knowledgeBaseArn,
    generativeModelArn,
  }: {
    knowledgeBaseArn: string;
    generativeModelArn: string;
  }): iam.ManagedPolicy {
    return new iam.ManagedPolicy(this, "test-function-policy", {
      statements: [
        new iam.PolicyStatement({
          sid: "AllowGenerateResponse",
          effect: iam.Effect.ALLOW,
          actions: ["bedrock:InvokeModel"],
          resources: [knowledgeBaseArn, generativeModelArn],
        }),
        new iam.PolicyStatement({
          sid: "AllowKnowledgeBaseAccess",
          effect: iam.Effect.ALLOW,
          actions: ["bedrock:Retrieve", "bedrock:RetrieveAndGenerate"],
          resources: [knowledgeBaseArn],
        }),
      ],
    });
  }
}
