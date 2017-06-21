# Node.js implementation of CloudFormation Custom Resources

## CloudWatch Events `Rule` and `Target` custom CloudFormation resources

The AWS CloudWatch Events service enables to define a `Rule` triggered from
various sources, each including multiple `Targets`. At the moment of writing
the native CloudFormation `CloudWatch::Events` resource does not include
support for most of the options already available for `Targets`.

This implementation is using Lambda functions, and a custom CloudFormation
resource that wraps these functions - so all of the available CloudWatch Events
options for `Rule` and `Targets` are available to be used.

The code is written as a general example on how to implement custom resources
with CloudFormation. The example includes simple way for unit testing the code
and generating YAML CloudFormation templates for custom resources.

More information is available in the [documentation for CloudFormation Custom Resources](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-custom-resources.html).

## Usage

1. Download the CloudFormation templates from GitHub Releases tab, or build using the instructions below.
1. Carefully read the template files to understand how they work!
1. Execute CloudFormation using the templates.
1. Now you can use the Custom Resources in your own CloudFormation templates like so -

    ```yaml
   CloudWatchEventsRule:
        Type: Custom::Events::Rule
        Parameters:
        ServiceToken:
            Fn::ImportValue: CustomResource-CloudWatchEventsRuleLambdaArn
        Name: 'STRING_VALUE'               - A name for this rule. *optional*
        Description: 'STRING_VALUE'        - A description of the rule.
        EventPattern: 'STRING_VALUE'       - The event pattern. For more information, see Events and Event Patterns in the Amazon CloudWatch Events User Guide.
        RoleArn: 'STRING_VALUE'            - The Amazon Resource Name (ARN) of the IAM role associated with the rule.
        ScheduleExpression: 'STRING_VALUE' - The scheduling expression. For example, "cron(0 20 * * ? *)", "rate(5 minutes)".
        State: 'ENABLED' | 'DISABLED'          - Indicates whether the rule is enabled or disabled. Possible values include: "ENABLED" "DISABLED"

    CloudWatchEventsRuleTarget:
        Type: Custom::Events::Target
        Parameters:
        ServiceToken:
            Fn::ImportValue: CustomResource-CloudWatchEventsTargetLambdaArn
        RuleArn: !Ref CloudWatchEventsRule  - (String) The name of the rule.
        Arn: 'STRING_VALUE'                 - (String) *required* The Amazon Resource Name (ARN) of the target.
        RoleArn: 'STRING_VALUE'             - (String) The Amazon Resource Name (ARN) of the IAM role to be used for this target when the rule is triggered. If one rule triggers multiple targets, you can use a different IAM role for each target.
        Input: 'STRING_VALUE'               - (String) Valid JSON text passed to the target. In this case, nothing from the event itself is passed to the target. You must use JSON dot notation, not bracket notation.
        InputPath: 'STRING_VALUE'           - (String) The value of the JSONPath that is used for extracting part of the matched event when passing it to the target. You must use JSON dot notation, not bracket notation.
        InputTransformer:                   - (map) Settings to enable you to provide custom input to a target based on certain event data. You can extract one or more key-value pairs from the event and then use that data to send customized input to the target.
            InputTemplate: 'STRING_VALUE'     - (String) *required* Input template where you can use the values of the keys from InputPathsMap to customize the data sent to the target.
            InputPathsMap:                    - (map<String>) Map of JSON paths to be extracted from the event. These are key-value pairs, where each value is a JSON path. You must use JSON dot notation, not bracket notation.
            InputTransformerPathKey: 'STRING_VALUE'
        KinesisParameters:                  - (map) The custom parameter you can use to control shard assignment, when the target is an Amazon Kinesis stream. If you do not include this parameter, the default is to use the eventId as the partition key.
            PartitionKeyPath: 'STRING_VALUE'  - (String) *required* The JSON path to be extracted from the event and used as the partition key.
        RunCommandParameters:               - (map) Parameters used when you are using the rule to invoke Amazon EC2 Run Command.
            RunCommandTargets:                - (Array<map>) Currently, we support including only one RunCommandTarget block, which specifies either an array of InstanceIds or a tag.
            - Key: 'STRING_VALUE'             - (String) *required* Can be either tag: tag-key or InstanceIds.
            Values:                         - (Array<String>) *required* If Key is tag: tag-key, Values is a list of tag values. If Key is InstanceIds, Values is a list of Amazon EC2 instance IDs.
            - 'STRING_VALUE'
        EcsParameters:                      - (map) Contains the Amazon ECS task definition and task count to be used, if the event target is an Amazon ECS task.
            TaskDefinitionArn: 'STRING_VALUE' - (String) *required* The ARN of the task definition to use if the event target is an Amazon ECS cluster.
            TaskCount: NUMBER_VALUE           - (Integer) The number of tasks to create based on the TaskDefinition. The default is one.

Full information about the various parameters is available in the official AWS
CloudWatch Events documentation for the `PutRule` and `PutTargets` APIs.

## Testing

To execute unit tests and verify the code in Lambda functions use -

    npm install
    npm test

## Build

Some of the original code is too big to be used as-is when creating
a Lambda function with CloudFormation `ZipFile` (limited to 4k).

For this reason, the `package.js` includes a script command to minify
the source javascript files into slimmer version.

To use -

    npm run min

The generated `*.min.js` files can then be copy-pasted into `ZipFile`
sections of their appropriate `Lambda::Function` CloudFormation definitions.

The copy-pasting is done with code in `build.js` and executed by using -

    npm run replace

A single command to generate the minified code and templates is available -

    npm build

Resulting YAML CloudFormation template files are then located in `dist/lib/`.

## License
MIT license, see LICENSE file for more detais.

## Credits
* [Evgeny Zislis](https://github.com/kesor)
* [Anton Sekatski](https://github.com/antonsekatski)
