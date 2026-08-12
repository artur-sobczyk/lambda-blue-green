import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

type ValidColor = "blue" | "green";

function isValidColor(value: string | undefined): value is ValidColor {
  return value === "blue" || value === "green";
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const sourceIp = event.requestContext?.http?.sourceIp ?? "unknown";
  const userAgent = event.headers?.["user-agent"] ?? "unknown";

  console.log(JSON.stringify({ sourceIp, userAgent }));

  const rawValue = process.env.COLOR;

  if (!isValidColor(rawValue)) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/html",
      },
      body: `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
  <h1>Configuration Error</h1>
  <p>Invalid or missing COLOR environment variable. Expected "blue" or "green", got: "${rawValue}"</p>
</body>
</html>`,
    };
  }

  const color: ValidColor = rawValue;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html",
    },
    body: `<!DOCTYPE html>
<html>
<head><title>Blue-Green Demo</title></head>
<body style="background-color: ${color};">
  <h1>Current color: ${color}</h1>
</body>
</html>`,
  };
};
