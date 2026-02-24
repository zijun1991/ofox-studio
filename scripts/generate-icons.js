const sharp = require('sharp')
const fs = require('fs')
const path = require('path')
const pngToIco = require('png-to-ico').default

const svgPath = path.join(__dirname, '../src/renderer/src/assets/images/logo.svg')
const buildDir = path.join(__dirname, '../build')
const iconsDir = path.join(buildDir, 'icons')

// 确保目录存在
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

// 读取 SVG
const svgBuffer = fs.readFileSync(svgPath)

// 基础尺寸配置
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

async function generateIcons() {
  console.log('🚀 开始生成图标...')

  // 1. 生成主 icon.png (1024x1024)
  const mainIconPath = path.join(buildDir, 'icon.png')
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(mainIconPath)
  console.log('✅ 生成 icon.png')

  // 2. 生成 icons 目录下的各尺寸图标
  for (const size of sizes) {
    const iconPath = path.join(iconsDir, `${size}x${size}.png`)
    await sharp(svgBuffer).resize(size, size).png().toFile(iconPath)
    console.log(`✅ 生成 icons/${size}x${size}.png`)
  }

  // 3. 生成 logo.png (1024x1024)
  const logoPath = path.join(buildDir, 'logo.png')
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(logoPath)
  console.log('✅ 生成 logo.png')

  // 4. 生成托盘图标 (32x32)
  const trayPath = path.join(buildDir, 'tray_icon.png')
  await sharp(svgBuffer).resize(32, 32).png().toFile(trayPath)
  console.log('✅ 生成 tray_icon.png')

  // 5. 生成暗色/亮色托盘图标（简单处理，暂用原图）
  const trayDarkPath = path.join(buildDir, 'tray_icon_dark.png')
  const trayLightPath = path.join(buildDir, 'tray_icon_light.png')
  await sharp(svgBuffer).resize(32, 32).png().toFile(trayDarkPath)
  await sharp(svgBuffer).resize(32, 32).png().toFile(trayLightPath)
  console.log('✅ 生成 tray_icon_dark.png / tray_icon_light.png')

  // 6. 生成 Windows .ico
  // ico 需要多种尺寸，用 256x256 的 PNG
  const ico256Path = path.join(iconsDir, '256x256.png')
  const icoBuffer = await pngToIco(ico256Path)
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer)
  console.log('✅ 生成 icon.ico')

  // 7. 生成 macOS .icns (需要 iconutil，macOS only)
  if (process.platform === 'darwin') {
    const iconsetDir = path.join(buildDir, 'iconset.iconset')
    if (fs.existsSync(iconsetDir)) {
      fs.rmSync(iconsetDir, { recursive: true })
    }
    fs.mkdirSync(iconsetDir, { recursive: true })

    // macOS iconset 需要的文件命名
    // icon_16x16.png      -> 16x16
    // icon_16x16@2x.png   -> 32x32
    // icon_32x32.png      -> 32x32
    // icon_32x32@2x.png   -> 64x64
    // icon_128x128.png    -> 128x128
    // icon_128x128@2x.png -> 256x256
    // icon_256x256.png    -> 256x256
    // icon_256x256@2x.png -> 512x512
    // icon_512x512.png    -> 512x512
    // icon_512x512@2x.png -> 1024x1024

    const iconMappings = [
      { src: '16x16.png', dest: 'icon_16x16.png' },
      { src: '32x32.png', dest: 'icon_16x16@2x.png' },
      { src: '32x32.png', dest: 'icon_32x32.png' },
      { src: '64x64.png', dest: 'icon_32x32@2x.png' },
      { src: '128x128.png', dest: 'icon_128x128.png' },
      { src: '256x256.png', dest: 'icon_128x128@2x.png' },
      { src: '256x256.png', dest: 'icon_256x256.png' },
      { src: '512x512.png', dest: 'icon_256x256@2x.png' },
      { src: '512x512.png', dest: 'icon_512x512.png' },
      { src: '1024x1024.png', dest: 'icon_512x512@2x.png' }
    ]

    for (const { src, dest } of iconMappings) {
      fs.copyFileSync(path.join(iconsDir, src), path.join(iconsetDir, dest))
    }

    // 添加 Contents.json
    const contentsJson = {
      images: [
        { filename: 'icon_16x16.png', size: '16x16' },
        { filename: 'icon_16x16@2x.png', size: '16x16@2x' },
        { filename: 'icon_32x32.png', size: '32x32' },
        { filename: 'icon_32x32@2x.png', size: '32x32@2x' },
        { filename: 'icon_128x128.png', size: '128x128' },
        { filename: 'icon_128x128@2x.png', size: '128x128@2x' },
        { filename: 'icon_256x256.png', size: '256x256' },
        { filename: 'icon_256x256@2x.png', size: '256x256@2x' },
        { filename: 'icon_512x512.png', size: '512x512' },
        { filename: 'icon_512x512@2x.png', size: '512x512@2x' }
      ],
      info: { author: 'xcode', version: 1 }
    }
    fs.writeFileSync(path.join(iconsetDir, 'Contents.json'), JSON.stringify(contentsJson, null, 2))

    // 使用 iconutil 生成 icns
    const { execSync } = require('child_process')
    execSync(`iconutil -c icns ${iconsetDir} -o ${path.join(buildDir, 'icon.icns')}`, { stdio: 'inherit' })

    // 清理 iconset
    fs.rmSync(iconsetDir, { recursive: true })
    console.log('✅ 生成 icon.icns')
  } else {
    console.log('⏭️ 跳过 icon.icns (仅 macOS 支持)')
  }

  console.log('🎉 全部完成!')
}

generateIcons().catch(console.error)
