const fs = require('fs');
const content = fs.readFileSync('/Users/kirankishorev/Documents/Projects/VSYK_FINAL/_VSYK/Frontend/app/(admin)/groups/[id].tsx', 'utf8');

const tags = ['View', 'ScrollView', 'TouchableOpacity', 'Text', 'Modal', 'SafeAreaView'];

tags.forEach(tag => {
  const openCount = (content.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
  const closeCount = (content.match(new RegExp(`</${tag}>`, 'g')) || []).length;
  const selfCloseCount = (content.match(new RegExp(`<${tag}[^>]*/>`, 'g')) || []).length;
  console.log(`${tag}: open=${openCount}, close=${closeCount}, selfClose=${selfCloseCount}, totalOpen=${openCount - selfCloseCount}`);
});
