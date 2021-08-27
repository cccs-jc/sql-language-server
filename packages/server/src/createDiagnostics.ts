import { parse } from '@joe-re/sql-parser'
import log4js from 'log4js';
import { PublishDiagnosticsParams, Diagnostic } from 'vscode-languageserver'
import { DiagnosticSeverity } from 'vscode-languageserver-types'
import { lint, ErrorLevel, LintResult, RawConfig } from 'sqlint'
import cache, { LintCache } from './cache'

const logger = log4js.getLogger()

function doLint(uri: string, sql: string, config?: RawConfig | null): Diagnostic[] {
  if (!sql) {
    return []
  }
  const result: LintResult[] = JSON.parse(lint({ configPath: process.cwd(), formatType: 'json', text: sql, configObject: config }))
  const lintDiagnostics = result.map(v => v.diagnostics).flat()
  const lintCache: LintCache[] = []
  const diagnostics = lintDiagnostics.map(v => {
    const diagnostic = {
      range: {
        start: { line: v.location.start.line - 1, character: v.location.start.column - 1 },
        end: { line: v.location.end.line - 1, character: v.location.end.column - 1 }
      },
      message: v.message,
      severity: v.errorLevel === ErrorLevel.Error ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      source: 'sql',
      relatedInformation: []
    }
    lintCache.push({ diagnostic, lint: v })
    return diagnostic
  })
  cache.setLintCache(uri, lintCache)
  return diagnostics
}

export default function createDiagnostics(uri: string, sql: string, config?: RawConfig | null): PublishDiagnosticsParams {
  logger.debug(`createDiagnostics`)
  let diagnostics: Diagnostic[] = []
  if (config) {
    try {
      const ast = parse(sql)
      logger.debug(`ast: ${JSON.stringify(ast)}`)
      diagnostics = doLint(uri, sql, config)
    } catch (e) {
      logger.debug('parse error')
      logger.debug(e)
      cache.setLintCache(uri, [])
      if (e.name !== 'SyntaxError') {
        throw e
      }
      diagnostics.push({
        range: {
          start: { line: e.location.start.line - 1, character: e.location.start.column },
          end: { line: e.location.end.line - 1, character: e.location.end.column }
        },
        message: e.message,
        severity: DiagnosticSeverity.Error,
        // code: number | string,
        source: 'sql',
        relatedInformation: [],
      })
    }
    logger.debug(`diagnostics: ${JSON.stringify(diagnostics)}`)
  }
  return { uri: uri, diagnostics }
}
