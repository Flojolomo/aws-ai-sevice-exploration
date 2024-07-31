import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { handler } from "./handler";
import { SNSEvent } from "aws-lambda";

jest.mock("@aws-sdk/client-s3");

describe("translation handler", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.skip("copies file in separate directory", async () => {
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: "aidemocasesstack-artifactstored87aac4e-ow4q8ggrifra",
      Key: "transcriptions/transcribe-sample.5fc2109bb28268d10fbc677e64b7e59256783d3c.txt",
    });

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "aidemocasesstack-artifactstored87aac4e-ow4q8ggrifra",
        Key: "translations/inputs/transcribe-sample.5fc2109bb28268d10fbc677e64b7e59256783d3c/transcribe-sample.5fc2109bb28268d10fbc677e64b7e59256783d3c.txt",
      })
    );
  });

  it("starts translation job", async () => {});
});

function testEvent(): SNSEvent {
  return {
    Records: [
      {
        EventSource: "aws:sns",
        EventVersion: "1.0",
        EventSubscriptionArn:
          "arn:aws:sns:eu-west-1:891376965822:AiDemoCasesStack-transcriptioncreatedE6FE4849-uwULQicUpOR7:f1df99a6-0352-4f27-ab10-87cfa3fdb597",
        Sns: {
          Type: "Notification",
          MessageId: "f31d9f99-b1a3-50ed-80f5-c0b911b0b11a",
          TopicArn:
            "arn:aws:sns:eu-west-1:891376965822:AiDemoCasesStack-transcriptioncreatedE6FE4849-uwULQicUpOR7",
          Subject: "Amazon S3 Notification",
          Message:
            '{"Records":[{"eventVersion":"2.1","eventSource":"aws:s3","awsRegion":"eu-west-1","eventTime":"2024-07-28T19:36:51.019Z","eventName":"ObjectCreated:Put","userIdentity":{"principalId":"AWS:AROA47CRVDC7A7PLOIYEW:postprocess-transcriptions"},"requestParameters":{"sourceIPAddress":"18.202.225.53"},"responseElements":{"x-amz-request-id":"PN1NVBR1FNFHHMHW","x-amz-id-2":"QzIIuWcRXWVtwYppmQEl0RwsZ4jo63+IJRymG8in70eerc/Snk3lup2uIFv1f2Box58tvKPiHqbgurQMx3wp7lg8w9TD3apI"},"s3":{"s3SchemaVersion":"1.0","configurationId":"ZjE2OWI2YjItYzk4NS00NjQ5LTk2ZjctYzRjODk5ZTRhZGE4","bucket":{"name":"aidemocasesstack-artifactstored87aac4e-ow4q8ggrifra","ownerIdentity":{"principalId":"A3A9OXJ573EQKB"},"arn":"arn:aws:s3:::aidemocasesstack-artifactstored87aac4e-ow4q8ggrifra"},"object":{"key":"transcriptions/transcribe-sample.5fc2109bb28268d10fbc677e64b7e59256783d3c.txt","size":508,"eTag":"833c473daaddb01fd79abf42b6e518dd","sequencer":"0066A69DD2EA597C19"}}}]}',
          Timestamp: "2024-07-28T19:36:51.728Z",
          SignatureVersion: "1",
          Signature:
            "dFnZ+L9BpIXlunMvNSunY0b2JgqiCyLCvqwWJzQZ3/yPlNrJzWdipFXrgP07MH/oCRoc0MbYua8uF//hjIan5caZxihsWPav+/EtVEA/bVoFJtqXBJPj18GfircXAR0XsnIDTXnZgeKLNX7OuqxN3b4nggCKLr9OxxQtGB40p38UyKVow3afkn4SljGkXyBEhJr+62SVokWhX/lY2K5BD7Rm7WdFYHanFqzTRU+P1Tmk2liUzmUHPukRaQJbLlaL6IL7qaoWRXZ8gWT0ndLYjsVuwMdZW5pKKTHEdMNKX7tqZHWMA8bXDsMiI1YWEleVEpsr9rv5jtVNS5FhZfSPFw==",
          SigningCertUrl:
            "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-60eadc530605d63b8e62a523676ef735.pem",
          UnsubscribeUrl:
            "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:891376965822:AiDemoCasesStack-transcriptioncreatedE6FE4849-uwULQicUpOR7:f1df99a6-0352-4f27-ab10-87cfa3fdb597",
          MessageAttributes: {},
        },
      },
    ],
  };
}
