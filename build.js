const fs = require('fs');

/* Paste a file with code into a CloudFormation `Zipfile` section
 * Assume that `ZipFile` is the very last operand in the file.
 * Assume that the new indent requires is 10 spaces at start of line.
 */
function pasteCloudFormationZipFile(sourceCode, sourceStack, targetStack) {
  // read minified code suitable for a cloudformation template
  // indent the code with 10 spaces at the start of each line
  const codeContent = fs.readFileSync(sourceCode)
    .toString()
    .replace(/^/gm, '          ');

  // read the incomplete cloudformation template
  // then place the newly indented code after `ZipFile: >` at EOF
  const stackContent = fs.readFileSync(sourceStack)
    .toString()
    .replace(/^(\s+ZipFile: >)([\s\S])+/m, '$1\n');

  console.log(`Replacing code in ${targetStack} ...`);
  // write the result in `dist/`
  fs.writeFileSync(targetStack, stackContent);
  fs.appendFileSync(targetStack, codeContent);
}

exports.replace = function replace() {
  pasteCloudFormationZipFile(
    'dist/lib/custom-cf-cw-events-rule.min.js',
    'lib/custom-cf-cw-events-rule.yaml',
    'dist/lib/custom-cf-cw-events-rule.yaml',
  );

  pasteCloudFormationZipFile(
    'dist/lib/custom-cf-cw-events-target.min.js',
    'lib/custom-cf-cw-events-target.yaml',
    'dist/lib/custom-cf-cw-events-target.yaml',
  );
};
