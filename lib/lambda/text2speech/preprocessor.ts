import {
  Polly,
  StartSpeechSynthesisTaskCommandInput,
} from "@aws-sdk/client-polly";
import { S3 } from "@aws-sdk/client-s3";
import { S3Event, S3EventRecord } from "aws-lambda";
import * as path from "path";

const s3Client = new S3();
const pollyClient = new Polly();

const localeMap = JSON.parse(process.env.LOCALE_MAP!);
const voiceMap = JSON.parse(process.env.VOICE_MAP!);

export const handler = async (event: S3Event) => {
  console.info("Start processing event", { event });

  const jobs = await Promise.allSettled(
    event.Records.map(async (record) => {
      await processFileRecord(record);
    })
  );

  console.info("Text2Speech jobs started", { jobs });
  return;
};

async function processFileRecord(record: S3EventRecord) {
  const fileContent = await readFileFromS3({
    bucketName: record.s3.bucket.name,
    objectKey: record.s3.object.key,
  });

  if (!fileContent) {
    console.error("No content found. Aborting ...");
    return;
  }

  const language = path.basename(record.s3.object.key).split(".")[0];
  const parentKey = path.dirname(record.s3.object.key).split("/").pop()!;

  return await startText2Speech({
    bucketName: record.s3.bucket.name,
    language,
    text: fileContent,
    parentKey,
  });
}

async function readFileFromS3({
  bucketName,
  objectKey,
}: {
  bucketName: string;
  objectKey: string;
}) {
  const getObjectProps = {
    Bucket: bucketName,
    Key: objectKey,
  };

  console.info("Reading object from S3 bucket", { getObjectProps });
  const object = await s3Client.getObject(getObjectProps);
  const body = await object.Body?.transformToString("utf-8");

  console.info("Read object from S3 bucket", { body });
  return body;
}

async function startText2Speech({
  bucketName,
  language,
  text,
  parentKey,
}: {
  bucketName: string;
  language: string;
  text: string;
  parentKey: string;
}) {
  const locale = localeMap[language];
  const params: StartSpeechSynthesisTaskCommandInput = {
    OutputFormat: "mp3",
    OutputS3BucketName: bucketName,
    LanguageCode: locale,
    Text: text,
    VoiceId: voiceMap[locale],
    OutputS3KeyPrefix: `${process.env
      .SPEECH_OUTPUT_PREFIX!}${parentKey}/${locale}/`,
    SnsTopicArn: process.env.SPEECH_SYNTHESIS_COMPLETE_TOPIC_ARN!,
  };

  try {
    console.info("Start speech synthesis task", { params });
    const result = await pollyClient.startSpeechSynthesisTask(params);
    console.info("Speech synthesis task started", { result });
    return result;
  } catch (error) {
    console.error("Error starting speech synthesis task", { error });
  }
}
