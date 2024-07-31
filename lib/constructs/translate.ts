import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { LambdaFunction } from "./lambda-function";
import path = require("path");
import * as s3 from "aws-cdk-lib/aws-s3";
import { IFunction } from "aws-cdk-lib/aws-lambda";

interface TranslateProps {
  bucket: s3.Bucket;
  inputFilePrefix: string;
  languageKeys: string[];
  outputPrefix: string;
}
export class Translate extends Construct {
  public constructor(scope: Construct, id: string, props: TranslateProps) {
    super(scope, id);

    const serviceRole = this.createServiceRole();
    const { function: translateJobStarterFunction } =
      this.createTranslateJobStarterFunction({
        inputBucket: props.bucket,
        inputPrefix: props.inputFilePrefix,
        languageKeys: props.languageKeys,
        outputBucket: props.bucket,
        outputPrefix: props.outputPrefix,
      });

    props.bucket.grantReadWrite(translateJobStarterFunction);
    Translate.allowPassRole(translateJobStarterFunction);
    Translate.allowStartingTranslateJob(translateJobStarterFunction);
  }

  private static allowPassRole(lambdaFunction: IFunction) {
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["iam:PassRole"],
        resources: ["*"],
      })
    );
  }

  private static allowStartingTranslateJob(lambdaFunction: IFunction) {
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["translate:*"],
        resources: ["*"],
      })
    );
  }

  private createServiceRole() {
    const role = new iam.Role(this, "translation-role", {
      assumedBy: new iam.ServicePrincipal("translate.amazonaws.com"),
    });

    new cdk.CfnOutput(this, "translation-role-arn", {
      value: role.roleArn,
    });

    return role;
  }

  private createTranslateJobStarterFunction({
    inputBucket,
    inputPrefix,
    languageKeys,
    outputBucket,
    outputPrefix,
  }: {
    inputBucket: s3.Bucket;
    inputPrefix: string;
    languageKeys: string[];
    outputBucket: s3.Bucket;
    outputPrefix: string;
  }) {
    return new LambdaFunction(this, "start-job", {
      functionProps: {
        entry: path.join(__dirname, "..", "lambda/translate/handler.ts"),
        environment: {
          TRANSLATION_OUTPUT_BUCKET: outputBucket.bucketName,
          TARGET_LANGUAGES: JSON.stringify(languageKeys),
          TRANSLATION_OUTPUT_PREFIX: outputPrefix,
        },
      },
      bucket: inputBucket,
      filters: [{ prefix: inputPrefix, suffix: ".txt" }],
    });
  }
}
