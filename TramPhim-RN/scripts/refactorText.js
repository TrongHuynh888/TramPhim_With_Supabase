const fs = require('fs');
const path = require('path');

function refactorFile(filePath, level) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) return;
  
  let content = fs.readFileSync(fullPath, 'utf8');

  if (!content.includes('import { AppText }')) {
    const importPath = level === 2 ? '../../components/AppText' : level === 1 ? '../components/AppText' : '../../../components/AppText';
    // Thêm import AppText sau import { Text }
    if (content.includes("import { Text")) {
      content = content.replace(/import\s+{([^}]*?)}\s+from\s+'react-native';/, (match, p1) => {
        return match + `\nimport { AppText } from '${importPath}';`;
      });
    } else {
      content = `import { AppText } from '${importPath}';\n` + content;
    }
  }

  // Thay thế <Text bằng <AppText
  content = content.replace(/<Text\b/g, '<AppText');
  content = content.replace(/<\/Text>/g, '</AppText>');

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('Refactored', filePath);
}

refactorFile('components/WebVideoPlayer.tsx', 1);
refactorFile('components/BottomTabBar.tsx', 1);
refactorFile('components/BannerCarousel.tsx', 1);
refactorFile('app/(tabs)/index.tsx', 2);
refactorFile('app/filter.tsx', 1);
refactorFile('app/profile/edit.tsx', 2);
