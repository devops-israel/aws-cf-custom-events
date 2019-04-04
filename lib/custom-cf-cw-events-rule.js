/**
 *  In CloudFormation the resource declaration is:
 *
 *  CloudWatchEventsRule:
 *    Type: Custom::Events::Rule
 *    Parameters:
 *      Name: 'STRING_VALUE'               - A name for this rule. *optional*
 *      Description: 'STRING_VALUE'        - A description of the rule.
 *      EventPattern: 'STRING_VALUE'       - The event pattern. For more information, see Events and Event Patterns in the Amazon CloudWatch Events User Guide.
 *      RoleArn: 'STRING_VALUE'            - The Amazon Resource Name (ARN) of the IAM role associated with the rule.
 *      ScheduleExpression: 'STRING_VALUE' - The scheduling expression. For example, "cron(0 20 * * ? *)", "rate(5 minutes)".
 *      State: ENABLED | DISABLED          - Indicates whether the rule is enabled or disabled. Possible values include: "ENABLED" "DISABLED"
 *
 *  # Outputs from CloudWatchEventsRule is 'Ref = Name', 'GetAtt.Arn = Arn'
 *
 *  CloudWatchEventsRuleTarget:
 *    Type: Custom::Events::Target
 *    Parameters:
 *      RuleArn: !GetAtt CloudWatchEventsRule.Arn
 *
 */

const CloudWatchEvents = require('aws-sdk/clients/cloudwatchevents');
const Response = require('cfn-response');

const cwe = new CloudWatchEvents();

// First, we export our log for tests
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
function optProp(event, paramName, defaultValue) {
  if (Object.prototype.hasOwnProperty.call(event.ResourceProperties, paramName)
    && event.ResourceProperties[paramName] !== undefined) {
    return event.ResourceProperties[paramName];
  }
  return defaultValue;
}

/**
 * Create a CloudWatch Events Rule.
 */
const createResource = exports.createResource = function createResource(event, context) {
  const resourceName = optProp(event, 'Name',
    `${event.StackId.replace(/^.*stack\/([^/]+)\/.*/g, '$1')}-${event.LogicalResourceId}-${exports.uniqueSuffix()}`);

  function createCallback(err, data) {
    if (err) {
      log.error(err, err.stack); // an error occurred
      Response.send(event, context, Response.FAILED, {});
      return;
    }
    Response.send(event, context, Response.SUCCESS, { Arn: data.RuleArn }, resourceName);
  }

  const params = {
    Name: resourceName, /* required */
    Description: optProp(event, 'Description'),
    EventPattern: optProp(event, 'EventPattern'),
    RoleArn: optProp(event, 'RoleArn'),
    ScheduleExpression: optProp(event, 'ScheduleExpression'),
    State: optProp(event, 'State'),
  };

  cwe.putRule(params, createCallback);
};

/**
 *  Delete a CloudWatch Events Rule.
 */
function deleteResource(event, context) {
  function deleteCallback(err) {
    if (err) {
      log.error(err, err.stack); // an error occurred
      Response.send(event, context, Response.FAILED, {});
      return;
    }
    Response.send(event, context, Response.SUCCESS, {}, event.PhysicalResourceId);
  }

  // TODO: Delete all associated targets when removed
  //       because CF creates targets on a new rule
  //       during replacement, but doesn't remove them
  //       from the existing rule. Rule updates require deletion!
  //       During deletion of a rule - it will first
  //       delete the targets (dependant resources)
  //       and only then remove the Rule.

  cwe.deleteRule({ Name: event.PhysicalResourceId }, deleteCallback);
}

/**
 * Update a CloudWatch Events Rule.
 * The only property that can be updated is the `State` property.
 * All other properties, when changed, require *replacement*.
 */
function updateResource(event, context) {
  /**
   *  Used by enableRule & disableRule when changing `State` property.
   */
  function updateCallback(err) {
    if (err) {
      log.error(err, err.stack); // an error occurred
      Response.send(event, context, Response.FAILED, {}, event.PhysicalResourceId);
      return;
    }

    Response.send(event, context, Response.SUCCESS, event.ResourceProperties, event.PhysicalResourceId);
  }

  /**
   * Check event.ResourceProperties against actual resource and initiate
   * an update (enable/disable) or a replace (create new) of the rule.
   *
   * @param {any} err  - error when failing to describe the rule.
   * @param {any} data - properties of successfully described Rule.
   */
  function describeCallback(err, data) {
    if (err) {
      log.error(err, err.stack); // an error occurred
      Response.send(event, context, Response.FAILED, {}, event.PhysicalResourceId);
      return;
    }

    // any property other than State is changed ==> Replacement!
    if (data.Name !== optProp(event, 'Name')
      || data.Arn !== optProp(event, 'Arn')
      || data.EventPattern !== optProp(event, 'EventPattern')
      || data.ScheduleExpression !== optProp(event, 'ScheduleExpression')
      || data.Description !== optProp(event, 'Description')
      || data.RoleArn !== optProp(event, 'RoleArn')
    ) {
      exports.createResource(event, context); // create a new (Replacement) rule
      return;
    }

    // replacement is not required, probably just a change to `State`

    if (data.State === optProp(event, 'State')) {
      // `State` was not changed, this is a NoOp just return.
      Response.send(event, context, Response.SUCCESS, {}, event.PhysicalResourceId);
      return;
    }

    // change to `State`, update the rule.
    switch (optProp(event, 'State')) {
      case 'ENABLED':
        cwe.enableRule({ Name: event.PhysicalResourceId }, updateCallback);
        break;
      case 'DISABLED':
        cwe.disableRule({ Name: event.PhysicalResourceId }, updateCallback);
        break;
      default:
        log.error(new Error(`Unknown 'State' value. Must be either 'ENABLED' or 'DISABLED', was '${optProp(event, 'State')}'.`));
        Response.send(event, context, Response.FAILED, {}, event.PhysicalResourceId);
        break;
    }
  }

  // diff existing rule with one received in `event.ResourceProperties`.
  cwe.describeRule({ Name: event.PhysicalResourceId }, describeCallback);
}

exports.handler = function handler(event, context) {
  log.info(event, context);
  switch (event.RequestType) {
    case 'Create':
      createResource(event, context);
      return;
    case 'Delete':
      deleteResource(event, context);
      return;
    case 'Update':
      updateResource(event, context);
      return;
    default:
      log.error(new Error(`ERROR: Unknown event.RequestType provided: ${event.RequestType}`));
      Response.send(event, context, Response.FAILED, {});
  }
};
