import ini from 'ini'
import yaml from 'js-yaml'
import { spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import semver from 'semver'

export function run(cmd, args = []) {
  console.log(`${cmd} ${args.join(' ')}`.trim())

  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
  if (result.status !== 0) process.exit(1)
}

export function download(url, filename) {
  const args = ['-sLf', '-o', filename, url]
  console.log(`curl ${args.join(' ')}`)

  spawnSync('curl', args, { shell: true })

  const exists = existsSync(filename)
  console.log(exists ? ' : succeeded' : ' : failed')
  return filename
}

export class Config {
  constructor() {
    Object.assign(this, yaml.load(readFileSync('config.yml', 'utf8')))
    this.zotero_beta = this['zotero-beta']
    delete this['zotero-beta']

    for (const client of [this.zotero, this.zotero7, this.zotero_beta]) {
      client.dependencies = [...(client.dependencies || []), ...this.common.dependencies]
    }

    this.staging = path.resolve(this.staging)
  }

  get client() {
    if (this.package === 'zotero') return this.zotero
    if (this.package === 'zotero-beta') return this.zotero_beta
    if (this.package === 'zotero7') return this.zotero7
    throw new Error(`Unknown package ${this.package}`)
  }

  version(v) {
    const rel = this.client.release?.[v]
    return rel ? `${v}-${rel}` : v
  }
}

export class Zotero {
  constructor(arch, mode) {
    this.arch = arch
    this.mode = mode
    this.beta = mode === 'beta'
    this.legacy = mode === 'legacy'

    this.targetArch = arch === 'amd64' ? 'x86_64' : arch === 'i386' ? 'i686' : 'arm64'
    this.bin = 'zotero'
    this.name = 'Zotero'
    this.vendor = 'Zotero'
    this.license = 'GNU Affero General Public License (version 3)'
    this.homepage = 'https://www.zotero.org/'

    this.config = new Config()
  }

  async init() {
    const channel = this.beta ? 'beta' : 'release'
    const updatesUrl = `https://www.zotero.org/download/client/manifests/${channel}/updates-linux-${this.targetArch}.json`

    console.log(`Getting ${this.mode} ${this.arch} updates from ${updatesUrl}`)

    const response = await fetch(updatesUrl)
    if (!response.ok) throw new Error('Could not get Zotero version')

    const versions = await response.json()
    const patch = v => v.replace(/^(\d+\.\d+)(?![.\d])/, '$1.0')
    console.log(versions)
    console.log(versions.map(v => patch(v.version)))
    this.versions = versions.map(v => v.version).sort((a, b) => semver.compare(patch(a), patch(b), { loose: true }))

    if (this.legacy) {
      this.versions = this.versions.filter(v => v.startsWith('7'))
      this.config.package = 'zotero7'
    }
    else if (this.beta) {
      this.config.package = 'zotero-beta'
    }
    else {
      this.config.package = 'zotero'
    }

    console.log(`Available versions: ${this.versions}`)
    if (this.versions.length === 0) {
      this.version = ''
      return
    }

    this.version = this.versions[this.versions.length - 1]
    this.ext = this.version >= '8' ? 'xz' : 'bz2'

    const urlv = encodeURIComponent(this.version)
    this.url = `https://download.zotero.org/client/${channel}/${urlv}/Zotero-${urlv}_linux-${this.targetArch}.tar.${this.ext}`

    // Clean version string
    this.versionClean = this.version.replace(/-beta/, '').replace(/^(\d+\.\d+)$/, '$1.0')
    this.release = this.config.client.release?.[this.versionClean] || 0

    return this
  }

  async mkdir(d) {
    const fullPath = path.isAbsolute(d) ? d : path.join(this.config.staging, d)
    await fs.mkdir(fullPath, { recursive: true })
    return fullPath
  }

  async stage() {
    await fs.rm(this.config.staging, { recursive: true, force: true })
    const staging = await this.mkdir(this.config.staging)

    const tarball = path.join(os.tmpdir(), `${this.config.package}.tar.${this.ext}`)
    download(this.url, tarball)

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

    const desktopPath = path.join(staging, `${this.bin}.desktop`)
    const desktop = ini.parse(await fs.readFile(desktopPath, 'utf-8'))

    const entry = desktop['Desktop Entry']
    this.config.client.section = (entry.Categories || 'Science;Office;Education;Literature').trim().replace(/;$/, '')

    const klass = (this.beta || this.legacy) ? `--class ${this.config.package}` : ''
    entry.Exec = `/usr/lib/${this.config.package}/${this.bin} ${klass} --url %u`.replace(/\s+/g, ' ')

    Enrty.name = this.name
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

    await fs.writeFile(desktopPath, ini.stringify(desktop))

    return this.config.staging
  }
}
