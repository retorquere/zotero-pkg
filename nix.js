#!/usr/bin/env node

import { execSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs'
import yaml from 'js-yaml'
import $stringify from 'json-stringify-deterministic'

function stringify(obj) {
  return $stringify(obj, { space: '  ' })
}

const config = yaml.load(readFileSync('config.yml', 'utf8'))
const cache = 'nix.json'
const cached = existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')) : {}

class Release {
  constructor(channel, arch, version) {
    const client = { release: 'zotero', beta: 'zotero-beta' }[channel]
    const rev = config[client].release[version] || ''

    this.version = `${version.replace('-beta', '')}${rev ? '-' : ''}${rev}`
    this.url = `https://download.zotero.org/client/${channel}/${encodeURIComponent(version)}/Zotero-${encodeURIComponent(version)}_${arch}.tar.xz`

    arch = arch.replace('linux-', '')
    this.arch = `${{arm64 : 'aarch64'}[arch] || arch}-linux`

    if (cached[channel]?.[this.arch]?.url === this.url) {
      this.hash = cached[channel][this.arch].hash
    }
    else {
      console.log('  fetching hash for', this.url)
      const cmd = `nix --extra-experimental-features "nix-command flakes" store prefetch-file --json '${this.url}'`
      const result = execSync(cmd, { encoding: 'utf8' })
      const { hash } = JSON.parse(result)
      this.hash = hash
    }
  }
}

const nix = {}
for (const channel of ['release', 'beta']) {
  const response = await fetch(`https://www.zotero.org/download/client/version?channel=${channel}`)
  if (!response.ok) {
    console.log('could not fetch versions for', channel)
    process.exit(1)
  }
  nix[channel] = await response.json()
  console.log('building', channel)
  nix[channel] = Object.entries(nix[channel])
    .filter(([a, v]) => a.startsWith('linux-'))
    .map(([a, v]) => new Release(channel, a, v))
    .map(r => [ r.arch, r ])
  nix[channel] = Object.fromEntries(nix[channel])
}

const changed = stringify(nix) !== stringify(cached)

console.log(changed ? '' : 'no', 'change detected')

if (changed) {
  writeFileSync(cache, stringify(nix, null, 2))
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`)
}
