#!/usr/bin/env node

import chalk from 'chalk'
import yaml from 'js-yaml'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

const amber = chalk.hex('#FFB000')

import { download, run, shell, Zotero } from './staging.js'

async function getHash(filename, algo) {
  const content = await fs.readFile(filename)
  // Map 'SHA256' to 'sha256' and handle 'MD5Sum' -> 'md5'
  return createHash(algo.toLowerCase().replace('sum', '')).update(content).digest('hex')
}

function banner(s, c = '*') {
  console.log('\n\n')
  const msg = `${c.repeat(3)} ${s} ${c.repeat(3)}`
  console.log(chalk.bgBlack(amber(c.repeat(msg.length))))
  console.log(chalk.bgBlack(amber(msg)))
  console.log(chalk.bgBlack(amber(c.repeat(msg.length))))
}

function humanReadable(size) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  while (size >= 1024 && units[1]) {
    size /= 1024
    units.shift()
  }
  return `${size.toFixed(1)} ${units[0]}`
}

async function main() {
  const repo = path.resolve('apt')
  await fs.mkdir(repo, { recursive: true })

  const keep = new Set()
  let updated = false

  for (const arch of ['arm64', 'amd64']) {
    for (const mode of ['beta', 'release']) {
      const zotero = await (new Zotero(arch, mode)).init()
      if (!zotero.version) {
        banner(`No versions found for ${arch} ${mode}`)
        continue
      }

      const deb = {
        name: `${zotero.config.package}_${zotero.config.version(zotero.version)}_${arch}.deb`,
      }
      deb.path = path.join(repo, deb.name)

      keep.add(deb.name)

      const prefix = `${arch} ${mode} ${zotero.version}`

      if (process.env.BUILD === 'true') {
        banner(`${prefix}: rebuilding ${deb.name}`)
      }
      else if (existsSync(deb.path)) {
        banner(`${prefix}: retaining ${deb.name}`)
        continue
      }
      else {
        const url = `https://zotero.retorque.re/file/apt-package-archive/${encodeURIComponent(deb.name)}`
        const success = download(url, deb.path)
        if (success) {
          banner(`${prefix}: fetched ${deb.name} from repo`)
          continue
        }
        banner(`${prefix}: building ${deb.name}`)
      }

      const staged = await zotero.stage()

      await fs.writeFile(
        'nfpm.yaml',
        yaml.dump({
          name: zotero.config.package,
          arch,
          platform: 'linux',
          version: zotero.version,
          ...(zotero.release ? { release: zotero.release } : {}),
          depends: zotero.config.client.dependencies,
          maintainer: `${zotero.config.maintainer.name} <${zotero.config.maintainer.email}>`,
          description: zotero.config.client.description,
          homepage: zotero.homepage,
          license: zotero.license,
          contents: [
            { src: staged, dst: `/usr/lib/${zotero.config.package}`, type: 'tree' },
            { src: path.join(staged, `${zotero.bin}.desktop`), dst: `/usr/share/applications/${zotero.config.package}.desktop` },
            { src: 'mime.xml', dst: `/usr/share/mime/packages/${zotero.config.package}.xml` },
            { src: `/usr/lib/${zotero.config.package}/${zotero.bin}`, dst: `/usr/bin/${zotero.config.package}`, type: 'symlink' },
          ],
          deb: {
            signature: {
              method: 'debsign',
              key_id: '6B08A8822B395BCA067C88AAEB9B577A1C349BFC',
            },
          },
        }),
      )
      run('nfpm', ['package', '-p', 'deb', '-t', repo])
      updated = true
    }
  }

  updated = updated || [
    'InRelease',
    'Packages',
    'Packages.bz2',
    'Release',
    'Release.gpg',
    'by-hash',
    'index.css',
    'index.html',
    'zotero-archive-keyring.pgp',
  ].find(asset => !existsSync(path.join(repo, asset)))

  if (updated || process.env.PUBLISH === 'true') {
    const maintainer = new Zotero('amd64', 'release').config.maintainer
    process.chdir(repo)

    banner('Rebuilding repo index', '=')

    const assets = await fs.readdir('.')
    for (const asset of assets) {
      const stats = await fs.stat(asset)
      if (stats.isFile() && !keep.has(asset) && !asset.startsWith('index.')) {
        console.log(`removing ${asset}`)
        await fs.unlink(asset)
      }
    }

    // Use shell for the pipe-heavy apt commands
    shell("apt-ftparchive packages . | awk 'BEGIN{ok=1} { if ($0 ~ /^E: /) { ok = 0 }; print } END{exit !ok}' > Packages")
    run('rm', ['-rf', 'by-hash'])
    run('bzip2', ['-kf', 'Packages'])
    shell('apt-ftparchive -o APT::FTPArchive::AlwaysStat=true -o APT::FTPArchive::Release::Codename=./ -o APT::FTPArchive::Release::Acquire-By-Hash=yes release . > Release')

    run('gpg', ['--yes', '-abs', '--local-user', maintainer.gpgkey, '-o', 'Release.gpg', '--digest-algo', 'sha256', 'Release'])
    run('gpg', ['--yes', '-abs', '--local-user', maintainer.gpgkey, '--clearsign', '-o', 'InRelease', '--digest-algo', 'sha256', 'Release'])

    for (const hsh of ['MD5Sum', 'SHA1', 'SHA256', 'SHA512']) {
      await fs.mkdir(`by-hash/${hsh}`, { recursive: true })
      for (const pkg of ['Packages', 'Packages.bz2']) {
        const fileHash = await getHash(pkg, hsh)
        await fs.copyFile(pkg, `by-hash/${hsh}/${fileHash}`)
      }
    }

    await fs.copyFile('../zotero-archive-keyring.gpg', 'zotero-archive-keyring.pgp')

    banner('building index', '=')
    await fs.copyFile('../README.css', 'index.css')
    const readme = await fs.readFile('../README.md', 'utf8')

    let md = `% Zotero packages for Debian-based systems\n${readme}\n\n`
    md += '| File name | Size |\n| --------- | ---- |\n'

    const files = (await fs.readdir('.')).filter(f => !f.match(/^index\./))
    for (const name of files.sort()) {
      const s = await fs.stat(name)
      if (s.isFile()) {
        md += `| [${name}](${encodeURIComponent(name)}) | ${humanReadable(s.size)} |\n`
      }
    }

    await fs.writeFile('index.md', md)
    run('pandoc', ['--standalone', '--css=index.css', '-i', 'index.md', '-o', 'index.html'])
    await fs.unlink('index.md')
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    await fs.appendFile(process.env.GITHUB_OUTPUT, 'update=true\n')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
