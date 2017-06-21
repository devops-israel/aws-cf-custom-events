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
  fakeCloudWatchEvents.prototype.putTargets = sinon.stub();
  fakeCloudWatchEvents.prototype.removeTargets = sinon.stub();

  const module = pq('../lib/custom-cf-cw-events-target.js', {
    'aws-sdk/clients/cloudwatchevents': fakeCloudWatchEvents,
    'cfn-response': fakeResponse,
  });

  return {
    module,
    fake: {
      CloudWatchEvents: {
        putTargets: fakeCloudWatchEvents.prototype.putTargets,
        removeTargets: fakeCloudWatchEvents.prototype.removeTargets,
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

test('events-targets: handler => invalid event.RequestType sends a FAILED response', (t) => {
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

test('events-targets: createResource => putTargets (Create) => returns an error', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Create',
    StackId: 'xxx-yyy-111-222',
    ResourceProperties: {
      Rule: 'events-rule-name',
    },
  };

  fm.fake.CloudWatchEvents.putTargets.yields({ message: 'big problem!', stack: 'long stack' }, null);

  fm.module.handler(event, context);

  t.plan(2);

  t.ok(fm.fake.log.error.getCall(0).args[0].message.match(/^.*big problem!/g),
    `FAILED response is logged to console: ${fm.fake.log.error.getCall(0).args[0].message}`,
  );

  t.ok(fm.fake.Response.send.calledWith(event, context, Response.FAILED, {}),
    'FAILED response is sent when putTargets returns an error',
  );
});

test('events-targets: createResource => putTargets (Create) => success', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Create',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'Target123',
    ResourceProperties: {
      Rule: 'events-rule-name',
      RoleArn: 'arn:aws:iam::012345678901:role/test-target-role',
      Arn: 'arn:aws:::012345678901:whatever',
    },
  };

  // returns errors in the returned object, not in err.
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchEvents.html#putTargets-property
  const data = {
    FailedEntryCount: 0,
    FailedEntries: [],
  };

  fm.fake.uniqueSuffix.returns('UT4QDIDSRK4IK');
  fm.fake.CloudWatchEvents.putTargets.yields(null, data);

  fm.module.handler(event, context);

  t.plan(1);

  const targetPhysicalId = 'test-stack-name-Target123-UT4QDIDSRK4IK';

  t.deepEqual(
    fm.fake.Response.send.firstCall.args,
    [event, context, Response.SUCCESS, {}, targetPhysicalId],
    'Response.send should be called with the correct params',
  );
});

test('events-targets: createResource => putTargets (Create) => FailedEntries', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Create',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'Target123',
    ResourceProperties: {
      Rule: 'events-rule-name',
      RoleArn: 'arn:aws:iam::012345678901:role/test-target-role',
      Arn: 'arn:aws:::012345678901:whatever',
    },
  };

  const targetPhysicalId = 'test-stack-name-Target123-UT4QDIDSRK4IK';

  // returns errors in the returned object, not in err.
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchEvents.html#putTargets-property
  const data = {
    FailedEntryCount: 1,
    FailedEntries: [
      {
        TargetId: targetPhysicalId,
        ErrorCode: 'SomeWeirdException',
        ErrorMessage: 'Something wrong has happened',
      },
    ],
  };

  fm.fake.uniqueSuffix.returns('UT4QDIDSRK4IK');
  fm.fake.CloudWatchEvents.putTargets.yields(null, data);

  fm.module.handler(event, context);

  t.plan(2);

  t.equal(fm.fake.log.error.getCall(0).args[0].message,
    'ERROR: SomeWeirdException: Something wrong has happened',
    `FAILED response is logged to console: ${fm.fake.log.error.getCall(0).args[0].message}`,
  );

  t.ok(fm.fake.Response.send.calledWith(event, context, Response.FAILED, {}),
    'FAILED response is sent when putTargets returns an error',
  );
});

test('events-targets: createResource => putTargets (Update) => success', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Update',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    PhysicalResourceId: 'test-stack-name-Target123-UT4QDIDSRK4IK',
    LogicalResourceId: 'Target123',
    ResourceProperties: {
      Rule: 'events-rule-name',
      RoleArn: 'arn:aws:iam::012345678901:role/test-target-role',
      Arn: 'arn:aws:::012345678901:whatever',
    },
  };

  const data = {
    FailedEntryCount: 0,
    FailedEntries: [],
  };

  fm.fake.CloudWatchEvents.putTargets.yields(null, data);

  fm.module.handler(event, context);

  t.plan(1);

  t.deepEqual(
    fm.fake.Response.send.firstCall.args,
    [event, context, Response.SUCCESS, {}, event.PhysicalResourceId],
    'Response.send should be called with the correct params',
  );
});

test('events-targets: deleteResource => removeTargets => failure', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Delete',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'Target123',
    PhysicalResourceId: 'test-stack-name-Target123-UT4QDIDSRK4IK',
    ResourceProperties: {
      Rule: 'events-rule-name',
    },
  };

  const err = new Error('test-error');

  // fail to delete rule
  fm.fake.CloudWatchEvents.removeTargets.yields(err, null);

  fm.module.handler(event, context);

  t.plan(3);

  t.deepEqual(fm.fake.CloudWatchEvents.removeTargets.firstCall.args[0],
    { Rule: 'events-rule-name', Ids: [event.PhysicalResourceId] },
    'removeTargets should be called with the right params',
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

test('events-targets: deleteResource => removeTargets => success', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Delete',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'Target123',
    PhysicalResourceId: 'test-stack-name-Target123-UT4QDIDSRK4IK',
    ResourceProperties: {
      Rule: 'events-rule-name',
    },
  };

  // fail to delete rule
  fm.fake.CloudWatchEvents.removeTargets.yields(null, {
    FailedEntryCount: 0,
    FailedEntries: [],
  });

  fm.module.handler(event, context);

  t.plan(2);

  t.deepEqual(fm.fake.CloudWatchEvents.removeTargets.firstCall.args[0],
    { Rule: 'events-rule-name', Ids: [event.PhysicalResourceId] },
    'removeTargets should be called with the right params',
  );

  t.deepEqual(fm.fake.Response.send.firstCall.args,
    [event, context, Response.SUCCESS, {}, event.PhysicalResourceId],
    'Response.send should be called with the correct params',
  );
});

test('events-targets: deleteResource => removeTargets => FailedEntries', (t) => {
  const fm = createModule();

  const event = {
    RequestType: 'Delete',
    StackId: 'arn:aws:cloudformation:us-east-1:012345678901:stack/test-stack-name/12345678-ab12-34cd-e56f-123456789abc',
    LogicalResourceId: 'Target123',
    PhysicalResourceId: 'test-stack-name-Target123-UT4QDIDSRK4IK',
    ResourceProperties: {
      Rule: 'events-rule-name',
    },
  };

  // returns errors in the returned object, not in err.
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchEvents.html#putTargets-property
  const data = {
    FailedEntryCount: 1,
    FailedEntries: [
      {
        TargetId: event.PhysicalResourceId,
        ErrorCode: 'SomeWeirdException',
        ErrorMessage: 'Something wrong has happened',
      },
    ],
  };

  fm.fake.CloudWatchEvents.removeTargets.yields(null, data);

  fm.module.handler(event, context);

  t.plan(3);

  t.deepEqual(fm.fake.CloudWatchEvents.removeTargets.firstCall.args[0],
    { Rule: 'events-rule-name', Ids: [event.PhysicalResourceId] },
    'removeTargets should be called with the right params',
  );

  t.equal(fm.fake.log.error.getCall(0).args[0].message,
    'ERROR: SomeWeirdException: Something wrong has happened',
    'FAILED response is logged to console',
  );

  t.ok(fm.fake.Response.send.calledWith(event, context, Response.FAILED, {}),
    'FAILED response is sent when removeTargets returns an error',
  );
});
