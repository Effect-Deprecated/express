// tracing: off

import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import * as M from "@effect-ts/core/Effect/Managed"
import type { Has } from "@effect-ts/core/Has"
import type { NonEmptyArray } from "@effect-ts/core/NonEmptyArray"
import { literal } from "@effect-ts/system/Function"
import { tag } from "@effect-ts/system/Has"
import type { _A, _R } from "@effect-ts/system/Utils"
import type { NextFunction, Request, RequestHandler, Response } from "express"
import express from "express"
import type { Server } from "http"

export const makeExpressApp = T.gen(function* (_) {
  const app = yield* _(T.effectTotal(() => express()))

  return {
    _tag: literal("ExpressApp"),
    app
  }
})

export interface ExpressApp extends _A<typeof makeExpressApp> {}
export const ExpressApp = tag<ExpressApp>()
export const LiveExpressApp = L.fromEffect(ExpressApp)(makeExpressApp)

export class NodeServerCloseError {
  readonly _tag = "NodeServerCloseError"
  constructor(readonly error: Error) {}
}

export class NodeServerListenError {
  readonly _tag = "NodeServerListenError"
  constructor(readonly error: Error) {}
}

export interface ExpressServerConfig {
  readonly _tag: "ExpressServerConfig"
  readonly port: number
  readonly host: string
}

export const ExpressServerConfig = tag<ExpressServerConfig>()

export const LiveExpressServerConfig = (host: string, port: number) =>
  L.succeed(ExpressServerConfig.of({ _tag: "ExpressServerConfig", host, port })).setKey(
    ExpressServerConfig.key
  )

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
    _tag: literal("ExpressServer"),
    server
  }
})

export interface ExpressServer extends _A<typeof makeExpressServer> {}
export const ExpressServer = tag<ExpressServer>()
export const LiveExpressServer = L.fromManaged(ExpressServer)(makeExpressServer)

export const LiveExpress = (host: string, port: number) =>
  LiveExpressServerConfig(host, port)[">+>"](LiveExpressApp[">+>"](LiveExpressServer))

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

export function match(method: Methods) {
  return function <
    Handlers extends NonEmptyArray<EffectRequestHandler<any, any, any, any, any, any>>
  >(
    path: PathParams,
    ...handlers: Handlers
  ): T.RIO<
    Has<ExpressApp> &
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
  > {
    return T.runtime()["|>"](
      T.chain((runtime) =>
        withExpressApp((app) =>
          T.effectTotal(() => {
            app[method](
              path,
              ...handlers.map(
                (handler): RequestHandler => (req, res, next) => {
                  runtime.run(handler(req, res, next))
                }
              )
            )
          })
        )
      )
    )
  }
}

export function use<
  Handlers extends NonEmptyArray<EffectRequestHandler<any, any, any, any, any, any>>
>(
  ...handlers: Handlers
): T.RIO<
  Has<ExpressApp> &
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
  Has<ExpressApp> &
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
export function use(...args: any[]): T.RIO<Has<ExpressApp>, void> {
  return T.runtime()["|>"](
    T.chain((runtime) =>
      withExpressApp((app) =>
        T.effectTotal(() => {
          if (typeof args[0] === "function") {
            app.use(
              ...args.map(
                (handler: EffectRequestHandler<unknown>): RequestHandler => (
                  req,
                  res,
                  next
                ) => {
                  runtime.run(handler(req, res, next))
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
                  runtime.run(handler(req, res, next))
                }
              )
            )
          }
        })
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
