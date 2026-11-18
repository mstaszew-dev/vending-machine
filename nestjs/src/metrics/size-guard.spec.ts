import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { directoryBytes, SizeGuard } from './size-guard'

async function withTempDir(action: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'dm-tsdb-'))
  try {
    await action(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('SizeGuard', () => {
  it('sums nested files of the data directory', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'a.parquet'), Buffer.alloc(100))
      await mkdir(join(dir, 'nested'), { recursive: true })
      await writeFile(join(dir, 'nested', 'b.parquet'), Buffer.alloc(250))

      await expect(directoryBytes(dir)).resolves.toBe(350)
    })
  })

  it('treats a missing directory as empty', async () => {
    await expect(directoryBytes('/definitely/not/here')).resolves.toBe(0)
  })

  it('reports ok below eighty percent of the budget', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'a.bin'), Buffer.alloc(700))

      const guard = new SizeGuard(dir, 1_000)

      await expect(guard.status()).resolves.toEqual({
        bytes: 700,
        maxBytes: 1_000,
        level: 'ok',
      })
    })
  })

  it('warns at eighty percent of the budget', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'a.bin'), Buffer.alloc(800))

      const guard = new SizeGuard(dir, 1_000)

      await expect(guard.status()).resolves.toMatchObject({ level: 'warning' })
    })
  })

  it('reports exceeded at the budget', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, 'a.bin'), Buffer.alloc(1_001))

      const guard = new SizeGuard(dir, 1_000)

      await expect(guard.status()).resolves.toMatchObject({ level: 'exceeded' })
    })
  })
})
