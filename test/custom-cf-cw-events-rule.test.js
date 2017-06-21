import { test } from 'tape';
import * as sinon from 'sinon';
import pq from 'proxyquire';
import * as Response from 'cfn-response';

const createModule = () => {
  // "cfn-response"
  const fakeResponse = sinon.stub();
  fakeResponse.send = sinon.stub();

  // "aws-sdk/clients/cloudwatchevents"
  const fakeCloudWatchEvents = sinon.stub();
  fakeCloudWatchEvents.prototype.putRule = sinon.stub();
  fakeCloudWatchEvents.prototype.deleteRule = sinon.stub();
  fakeCloudWatchEvents.prototype.enableRule = sinon.stub();
  fakeCloudWatchEvents.prototype.disableRule = sinon.stub();
  fakeCloudWatchEvents.prototype.describeRule = sinon.stub();

  const module = pq('../lib/custom-cf-cw-events-rule.js', {
    'aws-sdk/clients/cloudwatchevents': fakeCloudWatchEvents,
    'cfn-response': fakeResponse,
  });

  return {
    module,
    fake: {
      CloudWatchEvents: {
        putRule: fakeCloudWatchEvents.prototype.putRule,
        deleteRule: fakeCloudWatchEvents.prototype.deleteRule,
        enableRule: fakeCloudWatchEvents.prototype.enableRule,
        disableRule: fakeCloudWatchEvents.prototype.disableRule,
        describeRule: fakeCloudWatchEvents.prototype.describeRule,
      },
      Response: {
        send: fakeResponse.send,
      },
      log: {
        info: sinon.stub(module.log, 'info'),
        error: sinon.stub(module.log, 'error'),
      },
      uniqueSuffix: sinon.stub(module, 'uniqueSuffix'),
    },
  };
};

const context = { done() { } }; // a fake context

test('events-rule: handler => invalid event.RequestType sends a FAILED response', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Invalid',
  };

  fm.module.handler(event, context);

  t.plan(2);

  t.equal(fm.fake.log.error.firstCall.args[0].message,
    'ERROR: Unknown event.RequestType provided: Invalid',
    'FAILED response is logged to console',
  );

  t.ok(fm.fake.Response.send.calledWith(event, context, Response.FAILED, {}),
    'FAILED response is sent on invalid event.RequestType',
  );
});

test('events-rule: createResource => putRule => returns an error', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Create',
    StackId: 'xxx-yyy-111-222',
    ResourceProperties: {
      Name: 'events-rule-name',
      Description: 'long description',
      EventPattern: 'complex pattern',
      RoleArn: 'arn:aws:iam::012345678901:role/test-rule-role',
      ScheduleExpression: 'rate(1 minute)',
      State: 'DISABLED',
    },
  };

  fm.fake.CloudWatchEvents.putRule.yields({ message: 'big problem!', stack: 'long stack' }, null);

  fm.module.handler(event, context);

  t.plan(2);

  t.ok(fm.fake.log.error.firstCall.args[0].message.match(/^.*big problem!/g),
    `FAILED response is logged to console: ${fm.fake.log.error.firstCall.args[0].message}`,
  );

  t.ok(fm.fake.Response.send.calledWith(event, context, Response.FAILED, {}),
    'FAILED response is sent when no targets are specified',
  );
});

test('events-rule: createResource => putRule => success (with Name)', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Create',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: '123',
    ResourceProperties: {
      Name: 'events-rule-name',
      Description: 'long description',
      EventPattern: 'complex pattern',
      RoleArn: 'arn:aws:iam::012345678901:role/test-rule-role',
      ScheduleExpression: 'rate(1 minute)',
      State: 'DISABLED',
    },
  };

  const data = { RuleArn: 'arn:aws:events:us-east-1:012345678901:rule/test-rule' };

  fm.fake.CloudWatchEvents.putRule.yields(null, data);

  fm.module.handler(event, context);

  t.plan(2);

  t.deepEqual(
    fm.fake.Response.send.firstCall.args,
    [event, context, Response.SUCCESS, { Arn: data.RuleArn }, 'events-rule-name'],
    'Response.send SUCCESS with physicalResourceId of Name and RuleArn in data',
  );

  t.deepEqual(fm.fake.CloudWatchEvents.putRule.args[0][0], event.ResourceProperties,
    'putRule was passed all ResourceProperties',
  );
});

test('events-rule: createResource => putRule => success (without Name)', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Create',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'LogicalResourceId123',
    ResourceProperties: {
      Description: 'long description',
      EventPattern: 'complex pattern',
      RoleArn: 'arn:aws:iam::012345678901:role/test-rule-role',
      ScheduleExpression: 'rate(1 minute)',
      State: 'DISABLED',
    },
  };

  const data = { RuleArn: 'arn:aws:events:us-east-1:012345678901:rule/test-rule' };

  fm.fake.CloudWatchEvents.putRule.yields(null, data);
  fm.fake.uniqueSuffix.returns('UT4QDIDSRK4IK');

  fm.module.handler(event, context);

  t.plan(2);

  const expectedProperties = event.ResourceProperties;
  // generated name from `StackName-LogicalResourceId-UniqueSuffix`
  expectedProperties.Name = 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK';

  t.deepEqual(
    fm.fake.Response.send.firstCall.args,
    [event, context, Response.SUCCESS, { Arn: data.RuleArn }, expectedProperties.Name],
    'Response.send SUCCESS with physicalResourceId of Name and RuleArn in data',
  );

  t.deepEqual(fm.fake.CloudWatchEvents.putRule.args[0][0], expectedProperties,
    'putRule was passed all ResourceProperties and invented its own Name',
  );
});

test('events-rule: deleteResource => deleteRule => failure', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Delete',
    PhysicalResourceId: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
  };

  const err = new Error('test-error');

  // fail to delete rule
  fm.fake.CloudWatchEvents.deleteRule.yields(err, null);

  fm.module.handler(event, context);

  t.plan(3);

  t.deepEqual(fm.fake.CloudWatchEvents.deleteRule.firstCall.args[0],
    { Name: event.PhysicalResourceId },
    'deleteRule should be called with the right params',
  );

  t.deepEqual(fm.fake.log.error.firstCall.args,
    [err, err.stack],
    'log.error should be called with err and err.stack',
  );

  t.deepEqual(fm.fake.Response.send.firstCall.args,
    [event, context, Response.FAILED, {}],
    'Response.send should be called with the correct params',
  );
});

test('events-rule: deleteResource => deleteRule => success', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Delete',
    PhysicalResourceId: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
  };

  // doesn't actually return anything from delete callback when successful
  fm.fake.CloudWatchEvents.deleteRule.yields(null, {});

  fm.module.handler(event, context);

  t.plan(2);

  t.deepEqual(fm.fake.CloudWatchEvents.deleteRule.firstCall.args[0],
    { Name: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK' },
    'deleteRule should be called with the Name of the rule to delete',
  );

  t.deepEqual(fm.fake.Response.send.firstCall.args,
    [event, context, Response.SUCCESS, {}, event.PhysicalResourceId],
    'Response.send should be called with the correct params',
  );
});

test('events-rule: updateResource => describeRule => failure', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Update',
    PhysicalResourceId: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
  };

  const err = new Error('test-error');
  fm.fake.CloudWatchEvents.describeRule.yields(err, {});

  fm.module.handler(event, context);

  t.plan(3);

  t.deepEqual(fm.fake.CloudWatchEvents.describeRule.firstCall.args[0],
    { Name: event.PhysicalResourceId },
    'describeRule should be called with the right params',
  );

  t.deepEqual(fm.fake.log.error.firstCall.args,
    [err, err.stack],
    'log.error should be called with err and err.stack',
  );

  t.deepEqual(fm.fake.Response.send.firstCall.args,
    [event, context, Response.FAILED, {}, event.PhysicalResourceId],
    'Response.send should be called with the correct params',
  );
});

test('events-rule: updateResource => describeRule => success (Replace)', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Update',
    PhysicalResourceId: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'LogicalResourceId123',
    ResourceProperties: {
      Name: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
      Description: 'long description',
      EventPattern: 'complex pattern',
      RoleArn: 'arn:aws:iam::012345678901:role/test-rule-role',
      ScheduleExpression: 'rate(1 minute)',
      State: 'DISABLED',
    },
  };

  // copy resource properties by value, not reference
  const currentState = Object.assign({}, event.ResourceProperties);
  fm.fake.CloudWatchEvents.describeRule.yields(null, currentState);
  fm.module.createResource = sinon.stub(module, 'createResource');

  // pass a changed resource different from the described one
  event.ResourceProperties.Description = 'changed and needs replacement!';

  fm.module.handler(event, context);

  t.plan(2);

  t.deepEqual(fm.fake.CloudWatchEvents.describeRule.firstCall.args[0],
    { Name: event.PhysicalResourceId },
    'describeRule should be called with the right params',
  );

  t.ok(fm.module.createResource.calledWith(event, context),
    'createResource is called with (event,context) from updateResource',
  );
});

test('events-rule: updateResource => describeRule => success (state unchanged)', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Update',
    PhysicalResourceId: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'LogicalResourceId123',
    ResourceProperties: {
      Name: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
      Description: 'long description',
      EventPattern: 'complex pattern',
      RoleArn: 'arn:aws:iam::012345678901:role/test-rule-role',
      ScheduleExpression: 'rate(1 minute)',
      State: 'ENABLED',
    },
  };

  // copy resource properties by value, not reference
  const currentState = Object.assign({}, event.ResourceProperties);
  currentState.State = 'ENABLED';

  fm.fake.CloudWatchEvents.describeRule.yields(null, currentState);
  fm.module.createResource = sinon.stub(module, 'createResource');

  fm.module.handler(event, context);

  t.plan(3);

  t.deepEqual(fm.fake.CloudWatchEvents.describeRule.firstCall.args[0],
    { Name: event.PhysicalResourceId },
    'describeRule should be called with the right params',
  );

  t.ok(fm.module.createResource.notCalled,
    'createResource is not called from updateResource for state changes',
  );

  t.deepEqual(fm.fake.Response.send.firstCall.args,
    [event, context, Response.SUCCESS, {}, event.PhysicalResourceId],
    'Response.send should be called with the correct params',
  );
});

test('events-rule: updateResource => describeRule => success (state change failed)', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Update',
    PhysicalResourceId: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'LogicalResourceId123',
    ResourceProperties: {
      Name: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
      Description: 'long description',
      EventPattern: 'complex pattern',
      RoleArn: 'arn:aws:iam::012345678901:role/test-rule-role',
      ScheduleExpression: 'rate(1 minute)',
      State: 'DISABLED',
    },
  };

  // copy resource properties by value, not reference
  const currentState = Object.assign({}, event.ResourceProperties);
  currentState.State = 'ENABLED';

  fm.fake.CloudWatchEvents.describeRule.yields(null, currentState);
  fm.module.createResource = sinon.stub(module, 'createResource');

  const err = new Error('test-error');
  fm.fake.CloudWatchEvents.disableRule.yields(err, null);

  fm.module.handler(event, context);

  t.plan(2);

  t.deepEqual(fm.fake.log.error.firstCall.args,
    [err, err.stack],
    'log.error should be called with err and err.stack',
  );

  t.deepEqual(fm.fake.Response.send.firstCall.args,
    [event, context, Response.FAILED, {}, event.PhysicalResourceId],
    'Response.send should be called with the correct params',
  );
});

test('events-rule: updateResource => describeRule => success (state change to DISABLED)', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Update',
    PhysicalResourceId: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'LogicalResourceId123',
    ResourceProperties: {
      Name: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
      Description: 'long description',
      EventPattern: 'complex pattern',
      RoleArn: 'arn:aws:iam::012345678901:role/test-rule-role',
      ScheduleExpression: 'rate(1 minute)',
      State: 'DISABLED',
    },
  };

  // copy resource properties by value, not reference
  const currentState = Object.assign({}, event.ResourceProperties);
  currentState.State = 'ENABLED';

  fm.fake.CloudWatchEvents.describeRule.yields(null, currentState);
  fm.module.createResource = sinon.stub(module, 'createResource');

  fm.fake.CloudWatchEvents.disableRule.yields(null, {});

  fm.module.handler(event, context);

  t.plan(3);

  t.deepEqual(fm.fake.CloudWatchEvents.describeRule.firstCall.args[0],
    { Name: event.PhysicalResourceId },
    'describeRule should be called with the right params',
  );

  t.ok(fm.module.createResource.notCalled,
    'createResource is not called from updateResource for state changes',
  );

  t.deepEqual(fm.fake.Response.send.firstCall.args,
    [event, context, Response.SUCCESS, event.ResourceProperties, event.PhysicalResourceId],
    'Response.send should be called with the correct params',
  );
});

test('events-rule: updateResource => describeRule => success (state change to ENABLED)', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Update',
    PhysicalResourceId: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'LogicalResourceId123',
    ResourceProperties: {
      Name: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
      Description: 'long description',
      EventPattern: 'complex pattern',
      RoleArn: 'arn:aws:iam::012345678901:role/test-rule-role',
      ScheduleExpression: 'rate(1 minute)',
      State: 'ENABLED',
    },
  };

  // copy resource properties by value, not reference
  const currentState = Object.assign({}, event.ResourceProperties);
  currentState.State = 'DISABLED';

  fm.fake.CloudWatchEvents.describeRule.yields(null, currentState);
  fm.module.createResource = sinon.stub(module, 'createResource');

  fm.fake.CloudWatchEvents.enableRule.yields(null, {});

  fm.module.handler(event, context);

  t.plan(3);

  t.deepEqual(fm.fake.CloudWatchEvents.describeRule.firstCall.args[0],
    { Name: event.PhysicalResourceId },
    'describeRule should be called with the right params',
  );

  t.ok(fm.module.createResource.notCalled,
    'createResource is not called from updateResource for state changes',
  );

  t.deepEqual(fm.fake.Response.send.firstCall.args,
    [event, context, Response.SUCCESS, event.ResourceProperties, event.PhysicalResourceId],
    'Response.send should be called with the correct params',
  );
});

test('events-rule: updateResource => describeRule => success (state change to UNKNOWN)', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Update',
    PhysicalResourceId: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'LogicalResourceId123',
    ResourceProperties: {
      Name: 'test-stack-name-LogicalResourceId123-UT4QDIDSRK4IK',
      Description: 'long description',
      EventPattern: 'complex pattern',
      RoleArn: 'arn:aws:iam::012345678901:role/test-rule-role',
      ScheduleExpression: 'rate(1 minute)',
      State: 'UNKNOWN',
    },
  };

  // copy resource properties by value, not reference
  const currentState = Object.assign({}, event.ResourceProperties);
  currentState.State = 'DISABLED';

  fm.fake.CloudWatchEvents.describeRule.yields(null, currentState);
  fm.module.createResource = sinon.stub(module, 'createResource');

  fm.module.handler(event, context);

  t.plan(2);

  t.equal(fm.fake.log.error.firstCall.args[0].message,
    "Unknown 'State' value. Must be either 'ENABLED' or 'DISABLED', was 'UNKNOWN'.",
    'FAILED response is logged to console',
  );

  t.deepEqual(fm.fake.Response.send.firstCall.args,
    [event, context, Response.FAILED, {}, event.PhysicalResourceId],
    'Response.send should be called with the correct params',
  );
});
