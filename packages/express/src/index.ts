// tracing: off

import * as T from "@effect-ts/core/Effect"
import type { Cause } from "@effect-ts/core/Effect/Cause"
import * as F from "@effect-ts/core/Effect/Fiber"
import * as L from "@effect-ts/core/Effect/Layer"
import * as M from "@effect-ts/core/Effect/Managed"
import * as Supervisor from "@effect-ts/core/Effect/Supervisor"
import { pipe } from "@effect-ts/core/Function"
import type { Has } from "@effect-ts/core/Has"
import type { NonEmptyArray } from "@effect-ts/core/NonEmptyArray"
import { died, pretty } from "@effect-ts/system/Cause"
import { literal } from "@effect-ts/system/Function"
import { tag } from "@effect-ts/system/Has"
import type { _A, _R } from "@effect-ts/system/Utils"
import type { NextFunction, Request, RequestHandler, Response } from "express"
import express from "express"
import type { Server } from "http"

export const ExpressAppTag = literal("@effect-ts/express/App")

export const makeExpressApp = T.gen(function* (_) {
  const app = yield* _(T.effectTotal(() => express()))

  return {
    _tag: ExpressAppTag,
    app
  }
})

export interface ExpressApp extends _A<typeof makeExpressApp> {}
export const ExpressApp = tag<ExpressApp>().setKey(ExpressAppTag)
export const LiveExpressApp = L.fromEffect(ExpressApp)(makeExpressApp)

export const ExpressSupervisorTag = literal("@effect-ts/express/Supervisor")

export const makeExpressSupervisor = M.gen(function* (_) {
  const supervisor = yield* _(
    Supervisor.track["|>"](M.makeExit((s) => s.value["|>"](T.chain(F.interruptAll))))
  )

  return {
    _tag: ExpressSupervisorTag,
    supervisor
  }
})

export interface ExpressSupervisor extends _A<typeof makeExpressSupervisor> {}
export const ExpressSupervisor = tag<ExpressSupervisor>().setKey(ExpressSupervisorTag)
export const LiveExpressSupervisor = L.fromManaged(ExpressSupervisor)(
  makeExpressSupervisor
)

export class NodeServerCloseError {
  readonly _tag = "NodeServerCloseError"
  constructor(readonly error: Error) {}
}

export class NodeServerListenError {
  readonly _tag = "NodeServerListenError"
  constructor(readonly error: Error) {}
}

export const ExpressServerConfigTag = literal("@effect-ts/express/ServerConfig")

export interface ExpressServerConfig {
  readonly _tag: typeof ExpressServerConfigTag
  readonly port: number
  readonly host: string
  readonly exitHandler: typeof defaultExitHandler
}

export const ExpressServerConfig = tag<ExpressServerConfig>().setKey(
  ExpressServerConfigTag
)

export function LiveExpressServerConfig<R>(
  host: string,
  port: number,
  exitHandler: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => (cause: Cause<never>) => T.RIO<R, void>
) {
  return L.fromEffect(ExpressServerConfig)(
    T.access((r: R) => ({
      _tag: ExpressServerConfigTag,
      host,
      port,
      exitHandler: (req, res, next) => (cause) =>
        T.provideAll_(exitHandler(req, res, next)(cause), r)
    }))
  )
}

export const ExpressServerTag = literal("@effect-ts/express/Server")

export const makeExpressServer = M.gen(function* (_) {
  const { app } = yield* _(ExpressApp)
  const { host, port } = yield* _(ExpressServerConfig)

  const server = yield* _(
    M.make_(
      T.effectAsync<unknown, never, Server>((cb) => {
        const onError = (err: Error) => {
          cb(T.die(new NodeServerListenError(err)))
        }
        const server = app.listen(port, host, () => {
          cb(
            T.effectTotal(() => {
              server.removeListener("error", onError)
              return server
            })
          )
        })
        server.addListener("error", onError)
      }),
      (server) =>
        T.effectAsync<unknown, never, void>((cb) => {
          server.close((err) => {
            if (err) {
              cb(T.die(new NodeServerCloseError(err)))
            } else {
              cb(T.unit)
            }
          })
        })
    )
  )

  return {
    _tag: ExpressServerTag,
    server
  }
})

export interface ExpressServer extends _A<typeof makeExpressServer> {}
export const ExpressServer = tag<ExpressServer>().setKey(ExpressServerTag)
export const LiveExpressServer = L.fromManaged(ExpressServer)(makeExpressServer)

export type ExpressEnv = Has<ExpressServerConfig> &
  Has<ExpressSupervisor> &
  Has<ExpressApp> &
  Has<ExpressServer>

export function LiveExpress(
  host: string,
  port: number
): L.Layer<unknown, never, ExpressEnv>
export function LiveExpress<R>(
  host: string,
  port: number,
  exitHandler: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => (cause: Cause<never>) => T.RIO<R, void>
): L.Layer<R, never, ExpressEnv>
export function LiveExpress<R>(
  host: string,
  port: number,
  exitHandler?: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => (cause: Cause<never>) => T.RIO<R, void>
): L.Layer<R, never, ExpressEnv> {
  return LiveExpressServerConfig(host, port, exitHandler || defaultExitHandler)
    [">+>"](LiveExpressSupervisor)
    [">+>"](LiveExpressApp)
    [">+>"](LiveExpressServer)
}

export const expressApp = T.accessService(ExpressApp)((_) => _.app)

export const expressServer = T.accessService(ExpressServer)((_) => _.server)

export const { app: withExpressApp } = T.deriveAccessM(ExpressApp)(["app"])

export const { server: withExpressServer } = T.deriveAccessM(ExpressServer)(["server"])

export const methods = [
  "all",
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
  "checkout",
  "connect",
  "copy",
  "lock",
  "merge",
  "mkactivity",
  "mkcol",
  "move",
  "m-search",
  "notify",
  "propfind",
  "proppatch",
  "purge",
  "report",
  "search",
  "subscribe",
  "trace",
  "unlock",
  "unsubscribe"
] as const

export type Methods = typeof methods[number]

export type PathParams = string | RegExp | Array<string | RegExp>

export interface ParamsDictionary {
  [key: string]: string
}

export interface ParsedQs {
  [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[]
}

export interface EffectRequestHandler<
  R,
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs,
  Locals extends Record<string, any> = Record<string, any>
> {
  (
    req: Request<P, ResBody, ReqBody, ReqQuery, Locals>,
    res: Response<ResBody, Locals>,
    next: NextFunction
  ): T.RIO<R, void>
}

export function expressRuntime<R>() {
  return pipe(
    T.do,
    T.bind("supervisor", () => T.service(ExpressSupervisor)),
    T.bind("runtime", ({ supervisor: { supervisor } }) =>
      T.runtime<R>()["|>"](T.map((r) => r.supervised(supervisor)))
    ),
    T.map(({ runtime }) => runtime)
  )
}

export function match(
  method: Methods
): {
  <Handlers extends NonEmptyArray<EffectRequestHandler<any, any, any, any, any, any>>>(
    path: PathParams,
    ...handlers: Handlers
  ): T.RIO<
    ExpressEnv &
      _R<
        {
          [k in keyof Handlers]: [Handlers[k]] extends [
            EffectRequestHandler<infer R, any, any, any, any, any>
          ]
            ? T.RIO<R, void>
            : never
        }[number]
      >,
    void
  >
} {
  return function (path, ...handlers) {
    return expressRuntime()["|>"](
      T.chain((runtime) =>
        withExpressApp((app) =>
          T.accessServiceM(ExpressServerConfig)(({ exitHandler }) =>
            T.effectTotal(() => {
              app[method](
                path,
                ...handlers.map(
                  (handler): RequestHandler => (req, res, next) => {
                    runtime.run(
                      T.onTermination_(
                        handler(req, res, next),
                        exitHandler(req, res, next)
                      )
                    )
                  }
                )
              )
            })
          )
        )
      )
    )
  }
}

export function defaultExitHandler(
  _req: Request,
  _res: Response,
  _next: NextFunction
): (cause: Cause<never>) => T.RIO<unknown, void> {
  return (cause) =>
    T.effectTotal(() => {
      if (died(cause)) {
        console.error(pretty(cause))
      }
      _res.status(500).end()
    })
}

export function use<
  Handlers extends NonEmptyArray<EffectRequestHandler<any, any, any, any, any, any>>
>(
  ...handlers: Handlers
): T.RIO<
  ExpressEnv &
    _R<
      {
        [k in keyof Handlers]: [Handlers[k]] extends [
          EffectRequestHandler<infer R, any, any, any, any, any>
        ]
          ? T.RIO<R, void>
          : never
      }[number]
    >,
  void
>
export function use<
  Handlers extends NonEmptyArray<EffectRequestHandler<any, any, any, any, any, any>>
>(
  path: PathParams,
  ...handlers: Handlers
): T.RIO<
  ExpressEnv &
    _R<
      {
        [k in keyof Handlers]: [Handlers[k]] extends [
          EffectRequestHandler<infer R, any, any, any, any, any>
        ]
          ? T.RIO<R, void>
          : never
      }[number]
    >,
  void
>
export function use(...args: any[]): T.RIO<ExpressEnv, void> {
  return expressRuntime()["|>"](
    T.chain((runtime) =>
      withExpressApp((app) =>
        T.accessServiceM(ExpressServerConfig)(({ exitHandler }) =>
          T.effectTotal(() => {
            if (typeof args[0] === "function") {
              app.use(
                ...args.map(
                  (handler: EffectRequestHandler<unknown>): RequestHandler => (
                    req,
                    res,
                    next
                  ) => {
                    runtime.run(
                      T.onTermination_(
                        handler(req, res, next),
                        exitHandler(req, res, next)
                      )
                    )
                  }
                )
              )
            } else {
              app.use(
                args[0],
                ...args.slice(1).map(
                  (handler: EffectRequestHandler<unknown>): RequestHandler => (
                    req,
                    res,
                    next
                  ) => {
                    runtime.run(
                      T.onTermination_(
                        handler(req, res, next),
                        exitHandler(req, res, next)
                      )
                    )
                  }
                )
              )
            }
          })
        )
      )
    )
  )
}

export const all = match("all")
export const get = match("get")
export const post = match("post")
export const put = match("put")
const delete_ = match("delete")
export { delete_ as delete }
export const patch = match("patch")
export const options = match("options")
export const head = match("head")
export const checkout = match("checkout")
export const connect = match("connect")
export const copy = match("copy")
export const lock = match("lock")
export const merge = match("merge")
export const mkactivity = match("mkactivity")
export const mkcol = match("mkcol")
export const move = match("move")
export const mSearch = match("m-search")
export const notify = match("notify")
export const propfind = match("propfind")
export const proppatch = match("proppatch")
export const purge = match("purge")
export const report = match("report")
export const search = match("search")
export const subscribe = match("subscribe")
export const trace = match("trace")
export const unlock = match("unlock")
export const unsubscribe = match("unsubscribe")
