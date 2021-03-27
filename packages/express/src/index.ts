// tracing: off

import * as T from "@effect-ts/core/Effect"
import type { Cause } from "@effect-ts/core/Effect/Cause"
import * as F from "@effect-ts/core/Effect/Fiber"
import * as L from "@effect-ts/core/Effect/Layer"
import * as M from "@effect-ts/core/Effect/Managed"
import * as Supervisor from "@effect-ts/core/Effect/Supervisor"
import type { Has } from "@effect-ts/core/Has"
import type { NonEmptyArray } from "@effect-ts/core/NonEmptyArray"
import { AtomicBoolean } from "@effect-ts/core/Support/AtomicBoolean"
import { died, pretty } from "@effect-ts/system/Cause"
import { literal } from "@effect-ts/system/Function"
import { tag } from "@effect-ts/system/Has"
import type { _A, _R } from "@effect-ts/system/Utils"
import type { NextFunction, Request, RequestHandler, Response } from "express"
import express from "express"
import type { Server } from "http"

export class NodeServerCloseError {
  readonly _tag = "NodeServerCloseError"
  constructor(readonly error: Error) {}
}

export class NodeServerListenError {
  readonly _tag = "NodeServerListenError"
  constructor(readonly error: Error) {}
}

export const ExpressAppConfigTag = literal("@effect-ts/express/AppConfig")

export interface ExpressAppConfig {
  readonly _tag: typeof ExpressAppConfigTag
  readonly port: number
  readonly host: string
  readonly exitHandler: typeof defaultExitHandler
}

export const ExpressAppConfig = tag<ExpressAppConfig>().setKey(ExpressAppConfigTag)

export function LiveExpressAppConfig<R>(
  host: string,
  port: number,
  exitHandler: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => (cause: Cause<never>) => T.RIO<R, void>
) {
  return L.fromEffect(ExpressAppConfig)(
    T.access((r: R) => ({
      _tag: ExpressAppConfigTag,
      host,
      port,
      exitHandler: (req, res, next) => (cause) =>
        T.provideAll_(exitHandler(req, res, next)(cause), r)
    }))
  )
}

export const ExpressAppTag = literal("@effect-ts/express/App")

export const makeExpressApp = M.gen(function* (_) {
  const open = yield* _(
    T.effectTotal(() => new AtomicBoolean(true))["|>"](
      M.makeExit((_) => T.effectTotal(() => _.set(false)))
    )
  )

  const app = yield* _(T.effectTotal(() => express()))

  const { host, port } = yield* _(ExpressAppConfig)

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

  const supervisor = yield* _(
    Supervisor.track["|>"](M.makeExit((s) => s.value["|>"](T.chain(F.interruptAll))))
  )

  function runtime<R>() {
    return T.runtime<R>()
      ["|>"](T.map((r) => r.supervised(supervisor)))
      ["|>"](
        T.map((r) => <E, A>(self: T.Effect<R, E, A>) => {
          if (open.get) {
            r.runFiber(self)
          }
        })
      )
  }

  return {
    _tag: ExpressAppTag,
    app,
    supervisor,
    server,
    runtime
  }
})

export interface ExpressApp extends _A<typeof makeExpressApp> {}
export const ExpressApp = tag<ExpressApp>().setKey(ExpressAppTag)
export const LiveExpressApp = L.fromManaged(ExpressApp)(makeExpressApp)

export type ExpressEnv = Has<ExpressAppConfig> & Has<ExpressApp>

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
  return LiveExpressAppConfig(host, port, exitHandler || defaultExitHandler)[">+>"](
    LiveExpressApp
  )
}

export const expressApp = T.accessService(ExpressApp)((_) => _.app)

export const expressServer = T.accessService(ExpressApp)((_) => _.server)

export const { app: withExpressApp, server: withExpressServer } = T.deriveAccessM(
  ExpressApp
)(["app", "server"])

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
  return T.accessServiceM(ExpressApp)((_) => _.runtime<R>())
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
          T.accessServiceM(ExpressAppConfig)(({ exitHandler }) =>
            T.effectTotal(() => {
              app[method](
                path,
                ...handlers.map(
                  (handler): RequestHandler => (req, res, next) => {
                    runtime(
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
        T.accessServiceM(ExpressAppConfig)(({ exitHandler }) =>
          T.effectTotal(() => {
            if (typeof args[0] === "function") {
              app.use(
                ...args.map(
                  (handler: EffectRequestHandler<unknown>): RequestHandler => (
                    req,
                    res,
                    next
                  ) => {
                    runtime(
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
                    runtime(
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

/**
 * Lift an express requestHandler into an effectified variant
 */
export function classic(_: RequestHandler): EffectRequestHandler<unknown> {
  return (req, res, next) => T.effectTotal(() => _(req, res, next))
}
