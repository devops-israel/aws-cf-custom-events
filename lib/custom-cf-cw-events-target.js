/**
 *  Adds specified targets to the specified rule, or updates the targets if
 *  they are already associated with the rule.
 *
 *  In CloudFormation the resource declaration is:
 *
 *  CloudWatchEventsRule:
 *    Type: Custom::Events::Rule
 *
 *  CloudWatchEventsRuleTarget:
 *    Type: Custom::Events::Target
 *    Parameters:
 *      RuleArn: !Ref CloudWatchEventsRule  - (String) The name of the rule.
 *      Arn: 'STRING_VALUE'                 - (String) *required* The Amazon Resource Name (ARN) of the target.
 *      ### --- Id: 'STRING_VALUE'          - (String) *required* The ID of the target - will be generated!
 *      RoleArn: 'STRING_VALUE'             - (String) The Amazon Resource Name (ARN) of the IAM role to be used for this target when the rule is triggered. If one rule triggers multiple targets, you can use a different IAM role for each target.
 *      Input: 'STRING_VALUE'               - (String) Valid JSON text passed to the target. In this case, nothing from the event itself is passed to the target. You must use JSON dot notation, not bracket notation.
 *      InputPath: 'STRING_VALUE'           - (String) The value of the JSONPath that is used for extracting part of the matched event when passing it to the target. You must use JSON dot notation, not bracket notation.
 *      InputTransformer:                   - (map) Settings to enable you to provide custom input to a target based on certain event data. You can extract one or more key-value pairs from the event and then use that data to send customized input to the target.
 *        InputTemplate: 'STRING_VALUE'     - (String) *required* Input template where you can use the values of the keys from InputPathsMap to customize the data sent to the target.
 *        InputPathsMap:                    - (map<String>) Map of JSON paths to be extracted from the event. These are key-value pairs, where each value is a JSON path. You must use JSON dot notation, not bracket notation.
 *          <InputTransformerPathKey>: 'STRING_VALUE'
 *      KinesisParameters:                  - (map) The custom parameter you can use to control shard assignment, when the target is an Amazon Kinesis stream. If you do not include this parameter, the default is to use the eventId as the partition key.
 *        PartitionKeyPath: 'STRING_VALUE'  - (String) *required* The JSON path to be extracted from the event and used as the partition key.
 *      RunCommandParameters:               - (map) Parameters used when you are using the rule to invoke Amazon EC2 Run Command.
 *        RunCommandTargets:                - (Array<map>) Currently, we support including only one RunCommandTarget block, which specifies either an array of InstanceIds or a tag.
 *        - Key: 'STRING_VALUE'             - (String) *required* Can be either tag: tag-key or InstanceIds.
 *          Values:                         - (Array<String>) *required* If Key is tag: tag-key, Values is a list of tag values. If Key is InstanceIds, Values is a list of Amazon EC2 instance IDs.
 *          - 'STRING_VALUE'
 *      EcsParameters:                      - (map) Contains the Amazon ECS task definition and task count to be used, if the event target is an Amazon ECS task.
 *        TaskDefinitionArn: 'STRING_VALUE' - (String) *required* The ARN of the task definition to use if the event target is an Amazon ECS cluster.
 *        TaskCount: NUMBER_VALUE           - (Integer) The number of tasks to create based on the TaskDefinition. The default is one.
 */

const CloudWatchEvents = require('aws-sdk/clients/cloudwatchevents');
const Response = require('cfn-response');

const cwe = new CloudWatchEvents();

// exports.log is useful for tests
const log = exports.log = {
  info(...args) {
    console.log(...args);
  },
  error(...args) {
    console.error(...args);
  },
};

/**
 * Create a unique suffix for resource name similar
 * to those created by CloudFormation.
 *
 * @returns random 13 character long alpha numeric uppercase string
 */
// exports.uniqueSuffix is for tests
exports.uniqueSuffix = function uniqueSuffix() {
  const crypto = require('crypto'); // eslint-disable-line global-require
  return crypto.randomBytes(20)
    .toString('base64')
    .replace(/[^0-9a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 13);
};

/**
 *  Extract resource property from `event.ResourceProperties`.
 *
 * @param {event}  event         - original lambda event argument
 * @param {string} paramName     - object key under event.ResourceProperties
 * @param {string} defaultValue  - default value. use `undefined` when not provided.
 * @returns First among `event.ResourceProperties[paramName]`, `defaultValue` or `undefined`.
 */
function optProp(event, paramName, defaultValue, property) {
  if (Object.prototype.hasOwnProperty.call(event.ResourceProperties, paramName)
    && event.ResourceProperties[paramName] !== undefined) {
    if (property !== undefined) {
        return event.ResourceProperties[paramName][property];
    } else {
      return event.ResourceProperties[paramName];
    }
  }
  return defaultValue;
}

/**
 * Create a CloudWatch Events Rule.
 */
function createResource(event, context) {
  // maximum length for AWSEvents_<rulename>_<targetname> must have length less
  // than or equal to 100.

  // maximum length for Target Id is 64 characters
  let physicalResourceId = `${event.LogicalResourceId}`.slice(0,50) + `-${exports.uniqueSuffix()}`;

  if (event.RequestType == 'Update') {
    physicalResourceId = event.PhysicalResourceId;
  }

  function createCallback(err, data) {
    if (err) {
      log.error(err, err.stack); // an error occurred
      Response.send(event, context, Response.FAILED, {});
      return;
    }

    if (data.FailedEntryCount && data.FailedEntryCount > 0) {
      for (let e = 0; e < data.FailedEntryCount; e += 1) {
        log.error(new Error(`ERROR: ${data.FailedEntries[e].ErrorCode}: ${data.FailedEntries[e].ErrorMessage}`));
      }
      Response.send(event, context, Response.FAILED, {});
      return;
    }

    Response.send(event, context, Response.SUCCESS, {}, physicalResourceId);
  }

  const params = {
    Rule: optProp(event, 'Rule'),
    Targets: [{
      Id: physicalResourceId,
      Arn: optProp(event, 'Arn'),
      EcsParameters: optProp(event, 'EcsParameters'),
      Input: optProp(event, 'Input'),
      InputPath: optProp(event, 'InputPath'),
      InputTransformer: {
        InputPathsMap: optProp(event, 'InputTransformer', {}, 'InputPathsMap'),
        InputTemplate: optProp(event, 'InputTransformer', '', 'InputTemplate')
      },
      KinesisParameters: optProp(event, 'KinesisParameters'),
      RoleArn: optProp(event, 'RoleArn'),
      RunCommandParameters: optProp(event, 'RunCommandParameters'),
    }],
  };

  // remove all undefined properties
  for (let property in params.Targets[0]) {
    if (params.Targets[0][property] == undefined) {
      delete params.Targets[0][property]
    }
  }

  log.info("CloudWatchEvents PutTargets", JSON.stringify(params));
  cwe.putTargets(params, createCallback);
}

/**
 *  Delete a CloudWatch Events Rule.
 */
function deleteResource(event, context) {
  function deleteCallback(err, data) {
    if (err) {
      log.error(err, err.stack); // an error occurred
      Response.send(event, context, Response.FAILED, {});
      return;
    }

    if (data.FailedEntryCount && data.FailedEntryCount > 0) {
      for (let e = 0; e < data.FailedEntryCount; e += 1) {
        log.error(new Error(`ERROR: ${data.FailedEntries[e].ErrorCode}: ${data.FailedEntries[e].ErrorMessage}`));
      }
      Response.send(event, context, Response.FAILED, {});
      return;
    }

    Response.send(event, context, Response.SUCCESS, {}, event.PhysicalResourceId);
  }

  const params = {
    Rule: optProp(event, 'Rule'),
    Ids: [event.PhysicalResourceId]
  };

  log.info("CloudWatchEvents RemoveTargets", JSON.stringify(params));
  cwe.removeTargets(params, deleteCallback);
}

exports.handler = function handler(event, context) {
  log.info(event, context);
  switch (event.RequestType) {
    case 'Update':
    case 'Create':
      createResource(event, context);
      return;
    case 'Delete':
      deleteResource(event, context);
      return;
    default:
      log.error(new Error(`ERROR: Unknown event.RequestType provided: ${event.RequestType}`));
      Response.send(event, context, Response.FAILED, {});
  }
};
