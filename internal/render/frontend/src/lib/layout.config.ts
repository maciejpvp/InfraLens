export const defaultTopology = 'after'

export const CARD = { width: 244, height: 94 }
export const GROUP_HEADER_HEIGHT = 44

export const services: Record<string, readonly [string, string]> = {
  s3: ['S3', '#39afa4'],
  lambda: ['Lambda', '#cf9c66'],
  iam: ['IAM', '#c8799e'],
  ecs: ['ECS', '#829bd4'],
  'api-gateway': ['API Gateway', '#aa8dd0'],
  ec2: ['EC2', '#6da7af'],
  cloudwatch: ['CloudWatch', '#bc87b8'],
  eventbridge: ['EventBridge', '#bf83a0'],
  sqs: ['SQS', '#c7a05d'],
  sns: ['SNS', '#ce8fa6'],
  dynamodb: ['DynamoDB', '#729bd0'],
  'step-functions': ['Step Functions', '#a38bce'],
  opensearch: ['OpenSearch', '#8a9ed7'],
}
