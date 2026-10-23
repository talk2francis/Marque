import type { ChainReader } from './chain.js'
import type { Report, Task } from './task.js'

/**
 * Your grid trading logic. Read chain state with chain.client at chain.blockNumber and return a Report.
 * Run `pnpm test:mcs` to check it against the Standard.
 */
export async function analyse(task: Task, chain: ChainReader): Promise<Report> {
  throw new Error('Write your grid trading logic here. Run `pnpm test:mcs` to check it.')
}
