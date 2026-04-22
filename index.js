#!/usr/bin/env node

import Chalk from 'chalk'
import YAML from 'js-yaml'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import Path from 'node:path'

const amber = Chalk.hex('#FFB000')

import { download, exists, run, Zotero } from './staging.js'

function getHash(filename, algo) {
  const content = readFileSync(filename)
  // Map 'SHA256' to 'sha256' and handle 'MD5Sum' -> 'md5'
  return createHash(algo.toLowerCase().replace('sum', '')).update(content).digest('hex')
}

function banner(s, c = '*') {
  console.log('\n\n')
  const msg = `${c.repeat(3)} ${s} ${c.repeat(3)}`
  console.log(Chalk.bgBlack(amber(c.repeat(msg.length))))
  console.log(Chalk.bgBlack(amber(msg)))
  console.log(Chalk.bgBlack(amber(c.repeat(msg.length))))
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
  let maintainer = ''
  const repo = Path.resolve('apt')
  await fs.mkdir(repo, { recursive: true })

  const keep = new Set()
  const pending = []
  let updated = process.env.BUILD === 'true' || process.env.PUBLISH === 'true'

  for (const channel of ['release', 'beta']) {
    const response = await fetch(`https://www.zotero.org/download/client/version?channel=${channel}`)
    if (!response.ok) {
      console.log('could not fetch versions for', channel)
      process.exit(1)
    }
    const versions = await response.json()
    for (let [arch, version] of Object.entries(versions)) {
      if (!arch.startsWith('linux-')) continue
      arch = arch.replace(/^linux-/, '')

      const zotero = new Zotero(arch, channel, version)
      if (!zotero.version) {
        banner(`No versions found for ${arch} ${channel}`)
        continue
      }
      maintainer = zotero.config.maintainer

      const deb = new class {
        constructor() {
          this.arch = {
            x86_64: 'amd64',
            i686: 'i386',
            arm64: 'arm64',
          }[arch]
          if (!this.arch) {
            console.log('unexpected architecture', arch)
            process.exit(1)
          }

          this.name = `${zotero.config.package}_${zotero.config.version(zotero.version)}_${this.arch}.deb`,
          this.path = Path.join(repo, this.name)
          this.url = `https://zotero.retorque.re/file/apt-package-archive/${encodeURIComponent(this.name)}`
        }
      }

      keep.add(deb.name)

      const prefix = `${deb.arch} ${channel} ${zotero.version}`

      if (process.env.BUILD === 'true') {
        banner(`${prefix}: rebuilding ${deb.name}`)
      }
      else if (existsSync(deb.path) || await exists(deb.url)) {
        banner(`${prefix}: retaining ${deb.name}`)
        if (!existsSync(deb.path)) pending.push(deb)
        continue
      }
      else {
        banner(`${prefix}: building ${deb.name}`)
      }

      const staged = await zotero.stage()

      await fs.writeFile(
        'nfpm.yaml',
        YAML.dump({
          name: zotero.config.package,
          arch: deb.arch,
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
            { src: Path.join(staged, `${zotero.bin}.desktop`), dst: `/usr/share/applications/${zotero.config.package}.desktop` },
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
  ].find(asset => !existsSync(Path.join(repo, asset))) || false

  if (updated) {
    if (pending.length) {
      banner('Fetching retained packages', '=')
      for (const { url, path } of pending) {
        await download(url, path)
      }
    }

    process.chdir(repo)
    banner(`Rebuilding ${process.cwd()}`, '=')

    const assets = await fs.readdir('.')
    for (const asset of assets) {
      const stats = await fs.stat(asset)
      if (stats.isFile() && !keep.has(asset) && !asset.startsWith('index.')) {
        console.log(`removing ${asset}`)
        await fs.unlink(asset)
      }
    }

    const packages = run('apt-ftparchive', ['packages', '.'])
    if (packages.split('\n').find(_ => _.startsWith('E:'))) {
      console.log('apt-ftparchive failed')
      process.exit(1)
    }
    writeFileSync('Packages', packages)

    run('rm', ['-rf', 'by-hash'])
    run('bzip2', ['-kf', 'Packages'])

    writeFileSync('Release', run('apt-ftparchive', [
      '-o', 'APT::FTPArchive::AlwaysStat=true',
      '-o', 'APT::FTPArchive::Release::Codename=./',
      '-o', 'APT::FTPArchive::Release::Acquire-By-Hash=yes', 
      'release', '.'
    ]))

    run('gpg', ['--yes', '-abs', '--local-user', maintainer.gpgkey, '-o', 'Release.gpg', '--digest-algo', 'sha256', 'Release'])
    run('gpg', ['--yes', '-abs', '--local-user', maintainer.gpgkey, '--clearsign', '-o', 'InRelease', '--digest-algo', 'sha256', 'Release'])

    for (const hsh of ['MD5Sum', 'SHA1', 'SHA256', 'SHA512']) {
      await fs.mkdir(`by-hash/${hsh}`, { recursive: true })
      for (const pkg of ['Packages', 'Packages.bz2']) {
        const fileHash = getHash(pkg, hsh)
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
    await fs.appendFile(process.env.GITHUB_OUTPUT, `updated=${updated}\n`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
