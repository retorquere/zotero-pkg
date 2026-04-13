import chalk from 'chalk'
import * as ini from 'js-ini'
import yaml from 'js-yaml'
import { execFileSync, execSync } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import semver from 'semver'

import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'

class Status {
  constructor(msg) {
    this.msg = msg
    const yellow = chalk.bgBlack.hex('#FFFF00')
    process.stdout.write(yellow(msg))
  }

  fail() {
    process.stdout.write('\r\x1b[K' + chalk.bgBlack.red(this.msg) + '\n')
  }

  done() {
    process.stdout.write('\r\x1b[K' + chalk.bgBlack.green(this.msg) + '\n')
  }

  dump(err) {
    console.log(chalk.bgBlack.white(err.message))
    console.log(chalk.bgBlack.white(err.stderr))
  }
}

export function run(cmd, args = [], redir = '') {
  const status = new Status(`$ ${cmd} ${args.join(' ')}`.trim())
  try {
    const output = execFileSync(cmd, args, { encoding: 'utf-8' })
    if (redir) writeFileSync(redir, output)
    status.done()
    if (output) console.log(chalk.bgBlack.white(output))
    return output
  }
  catch (err) {
    status.fail()
    status.dump(err)
    process.exit(1)
  }
}

export function shell(cmd) {
  const status = new Status(`$ ${cmd}`)
  try {
    const output = execSync(cmd, { encoding: 'utf-8' })
    status.done()
    if (output) console.log(chalk.bgBlack.white(output))
    return output
  }
  catch (err) {
    status.fail()
    status.dump(err)
    process.exit(1)
  }
}

export async function exists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  }
  catch (error) {
    return false
  }
}

export async function download(url, filename) {
  const status = new Status(`downloading ${url}`)

  const response = await fetch(url)
  if (!response.ok) {
    status.fail()
    console.log('download of', url, 'failed')
    process.exit(1)
  }

  const target = createWriteStream(filename)
  const body = Readable.fromWeb(response.body)
  body.pipe(target)
  await finished(target)

  if (existsSync(filename)) {
    status.done()
  }
  else {
    status.fail()
    console.log('download of', url, 'failed')
    process.exit(1)
  }
}

export class Config {
  constructor(beta) {
    Object.assign(this, yaml.load(readFileSync('config.yml', 'utf8')))
    this.package = beta ? 'zotero-beta' : 'zotero'
    this.beta = this['zotero-beta']
    delete this['zotero-beta']

    for (const client of [this.zotero, this.beta]) {
      client.dependencies = [...(client.dependencies || []), ...this.common.dependencies]
    }

    this.staging = path.resolve(this.staging)
  }

  get client() {
    if (this.package === 'zotero') return this.zotero
    if (this.package === 'zotero-beta') return this.beta
    throw new Error(`Unknown package ${this.package}`)
  }

  version(v) {
    const rel = this.client.release?.[v]
    return rel ? `${v}-${rel}` : v
  }
}

export class Zotero {
  constructor(arch, channel, version) {
    this.arch = arch
    this.version = version
    this.beta = channel === 'beta'

    this.bin = 'zotero'
    this.name = 'Zotero'
    this.vendor = 'Zotero'
    this.license = 'GNU Affero General Public License (version 3)'
    this.homepage = 'https://www.zotero.org/'

    this.config = new Config(this.beta)
    this.ext = 'xz'

    const urlv = encodeURIComponent(version)
    this.url = `https://download.zotero.org/client/${channel}/${urlv}/Zotero-${urlv}_linux-${this.arch}.tar.${this.ext}`
    this.version = version.replace(/-beta/, '').replace(/^(\d+\.\d+)$/, '$1.0')
    this.release = this.config.client.release?.[this.version] || 0
  }

  async mkdir(d) {
    const fullPath = path.isAbsolute(d) ? d : path.join(this.config.staging, d)
    await fs.mkdir(fullPath, { recursive: true })
    return fullPath
  }

  ini(inifile, mod) {
    const data = ini.parse(readFileSync(inifile, 'utf-8'))
    mod(data)
    writeFileSync(
      inifile,
      ini.stringify(data, {
        blankLine: false,
        spaceBefore: false,
        spaceAfter: false,
      }),
    )
  }

  async stage() {
    await fs.rm(this.config.staging, { recursive: true, force: true })
    const staging = await this.mkdir(this.config.staging)

    const tarball = path.join(os.tmpdir(), `${this.config.package}.tar.${this.ext}`)
    await download(this.url, tarball)

    run('tar', [this.ext === 'bz2' ? '-xjf' : '-xJf', tarball, '-C', staging, '--strip-components=1'])

    const prefDir = await this.mkdir(path.join(staging, 'defaults', 'pref'))
    const localSettings = path.join(prefDir, 'local_settings.js')
    let lsContent = existsSync(localSettings) ? await fs.readFile(localSettings, 'utf8') : ''
    lsContent += (lsContent ? '\n' : '')
      + `pref("general.config.obscure_value", 0);\n`
      + `pref("general.config.filename", "mozilla.cfg");\n`
    await fs.writeFile(localSettings, lsContent)

    // disable auto-update
    const mozCfg = path.join(staging, 'mozilla.cfg')
    let cfgContent = existsSync(mozCfg) ? await fs.readFile(mozCfg, 'utf8') : ''
    if (!cfgContent) cfgContent = '//\n'
    cfgContent += `lockPref("app.update.enabled", false);\nlockPref("app.update.auto", false);\n`
    await fs.writeFile(mozCfg, cfgContent)

    this.ini(path.join(staging, `${this.bin}.desktop`), desktop => {
      const entry = desktop['Desktop Entry']
      this.config.client.section = (entry.Categories || 'Science;Office;Education;Literature').trim().replace(/;$/, '')

      const klass = (this.beta || this.legacy) ? `--class ${this.config.package}` : ''
      entry.Exec = `/usr/lib/${this.config.package}/${this.bin} ${klass} --url %u`.replace(/\s+/g, ' ')

      entry.Name = this.name
      if (this.beta) entry.Name += ' Beta'
      if (this.legacy) entry.Name += ' (Legacy)'

      entry.Comment = 'Zotero is a free, easy-to-use tool to help you collect, organize, cite, and share research'
      const iconPath = this.legacy ? 'chrome/icons/default/default256.png' : 'icons/icon128.png'
      entry.Icon = `/usr/lib/${this.config.package}/${iconPath}`

      entry.MimeType = [
        'x-scheme-handler/zotero',
        'application/x-endnote-refer',
        'application/x-research-info-systems',
        'text/ris',
        'text/x-research-info-systems',
        'application/x-inst-for-Scientific-info',
        'application/mods+xml',
        'application/rdf+xml',
        'application/x-bibtex',
        'text/x-bibtex',
        'application/marc',
        'application/vnd.citationstyles.style+xml',
      ].join(';')
    })

    if (this.beta) {
      run('mogrify', [
        '-font', 'DejaVu-Sans-Bold',
        '-pointsize', '40',
        '-gravity', 'NorthWest',
        '-fill', 'red',
        '-stroke', 'black',
        '-strokewidth', '2',
        '-annotate', '+10+6', 'β',
        path.join(staging, 'icons/icon128.png'),
      ])

      /*
      this.ini(path.join(staging, 'app', 'application.ini'), app => {
        app.App.Name = 'Zotero (beta)'
      })
      */
    }

    return this.config.staging
  }
}
