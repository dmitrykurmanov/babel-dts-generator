import { id, factory } from './utils';

class Node {
  constructor() {
    this._leadingComments = null;
  }

  fromSource(node) {
    this._leadingComments = node.leadingComments || null;

    return this;
  }

  toCode(ctx) {
    const output = this._getCommentString(ctx) + this._toCode(ctx);

    return output
      .split('\n')
      .map(indent(ctx))
      .join('\n');
  }

  toString(ctx = {}) {
    return this.toCode({ ...emptyCtx(), ...ctx });
  }

  _getCommentString({ suppressComments }) {
    if (suppressComments) {
      return '';
    }

    const comments = this._leadingComments ?
      this._leadingComments.map(s => {
        switch (s.type) {
          case 'CommentLine':
            return `// ${s.value}`;

          case 'CommentBlock':
            return `/*${s.value}*/`;

          default:
            return null;
        }
      }).filter(id).join('\n') : '';

    return comments.length === 0 ? '' : `\n${comments}\n`;
  }

  // Note: _toCode is not expected to indent itself, only children.
  _toCode() {
    throw new Error('toCode is abstract.');
  }

  _includeComments() {
    return true;
  }
}

@factory
class ModuleDeclarationNode extends Node {
  constructor(name, children) {
    super();

    this._name = name;
    this._children = children;
  }

  _toCode(ctx) {
    const code = this._children.map(toCode(ctx.indent())).join('\n');
    return `declare module ${this._name} {\n${code}\n}`;
  }
}

@factory
class ExportAllFromNode extends Node {
  constructor(source) {
    super();

    this._source = source;
  }

  _toCode() {
    return `export * from '${this._source}';`;
  }
}

@factory
class ExportNamedDeclarationNode extends Node {
  constructor(declaration) {
    super();

    this._declaration = declaration;
  }

  _toCode(ctx) {
    const decl = this._declaration.toCode({ ...ctx, level: 0 });
    const suffix = this._declaration.preventSemi ? '' : ';';

    return `export ${decl}${suffix}`;
  }
}

@factory
class VariableDeclarationNode extends Node {
  constructor(kind, declarations) {
    super();

    this._kind = kind;
    this._declarations = declarations;
  }

  _toCode(ctx) {
    const kind = this._kind;
    let declarations = this._declarations.map(toCode({ ...ctx, level: 0 })).filter(id);
    if (declarations.length === 0) {
      return null;
    }

    if (declarations.length > 1) {
      const extraIndent = ctx.multiVarStep;

      const doIndent = indent({ level: 1, step: extraIndent });
      declarations = declarations.map((dec, i) => {
        if (i === 0) {
          return dec;
        }

        return doIndent(dec);
      });
    }

    const decCode = declarations.join(',\n');

    return `${kind} ${decCode}`;
  }
}

@factory
class VariableDeclaratorNode extends Node {
  constructor(name, type) {
    super();

    this._name = name;
    this._type = type;
  }

  _toCode() {
    return `${this._name}: ${this._type}`;
  }
}

@factory
class ExportSpecifierNode extends Node {
  constructor(exported, local) {
    super();

    this._exported = exported;
    this._local = local;
  }

  _toCode() {
    if (!this._local || this._local === this._exported) {
      return `${this._exported}`;
    }

    return `${this._exported} as ${this._local}`;
  }
}

@factory
class ExportNode extends Node {
  constructor(exported, source) {
    super();

    this._exported = exported;
    this._source = source;
  }

  _toCode(ctx) {
    const exported = this._exported.map(toCode({ ...ctx, level: 1 })).join(',\n');

    if (this._source) {
      return `export {\n${exported}\n} from '${this._source}';`;
    }

    return `export {\n${exported}\n};`;
  }
}

@factory
class ParameterNode extends Node {
  constructor(name, type, isRest) {
    super();

    this._name = name;
    this._type = type;
    this._isRest = isRest;
  }

  asRestParam() {
    if (this._isRest) {
      return this;
    }

    return ParameterNode(this._name, this._type, true);
  }

  _includeComments() {
    return false;
  }

  _toCode() {
    return `${this._isRest ? '...' : ''}${this._name}: ${this._type}`;
  }
}

@factory
class MethodNode extends Node {
  constructor(name, params, type) {
    super();

    this._name = name;
    this._params = params;
    this._type = type;
  }

  get name() {
    return this._name;
  }

  _toCode(ctx) {
    const params = this._params.map(toCode({ ...ctx, level: 0 })).join(', ');
    const type = this._type !== null ? `: ${this._type}` : '';

    return `${this.name}(${params})${type}`;
  }
}

@factory
class FunctionNode extends MethodNode {
  constructor(name, params, type) {
    super(name, params, type);
  }

  _toCode(ctx) {
    return `function ${super._toCode(ctx)}`;
  }
}

@factory
class InterfaceNode extends Node {
  constructor(name, members, baseInterfaces) {
    super();

    this._name = name;
    this._members = members;
    this._baseInterfaces = baseInterfaces;
  }

  _toCode(ctx) {
    const members = this._members.map(toCode({ ...ctx, level: 1 })).join('\n');
    const baseInterfaces = this._baseInterfaces.map(toCode({ ...ctx, level: 0 })).join(', ');
    const extendsStr = baseInterfaces.length === 0 ? '' : ` extends ${baseInterfaces}`;

    return `export interface ${this._name}${extendsStr} {\n${members}\n}`;
  }
}

@factory
class InterfaceMethodNode extends MethodNode {
  constructor(name, params, type, isStatic, isOptional) {
    super(name, params, type);

    this._static = isStatic;
    this._optional = isOptional;
  }

  get name() {
    return this._optional ? `${super.name}?` : super.name;
  }

  _toCode(ctx) {
    const prefix = this._static ? 'static ' : '';

    return `${prefix}${super._toCode(ctx)};`;
  }
}

@factory
class InterfacePropertyNode extends Node {
  constructor(name, type, isStatic, isOptional) {
    super();

    this._name = name;
    this._type = type;
    this._static = isStatic;
    this._optional = isOptional;
  }

  _toCode() {
    const prefix = this._static ? 'static ' : '';
    const name = this._optional ? `${this._name}?` : this._name;

    return `${prefix}${name}: ${this._type};`;
  }
}

@factory
class InterfaceIndexerNode extends Node {
  constructor(name, keyType, returnType) {
    super();

    this._name = name;
    this._keyType = keyType;
    this._returnType = returnType;
  }

  _toCode() {
    return `[${this._name}: ${this._keyType}]: ${this._returnType};`;
  }
}

@factory
class ClassNode extends Node {
  constructor(name, superName, members) {
    super();

    this._name = name;
    this._super = superName;
    this._members = members;
  }

  _toCode(ctx) {
    const members = this._members.map(toCode({ ...ctx, level: 1 })).join('\n');
    const superStr = this._super ? ` extends ${this._super}` : '';

    return `class ${this._name}${superStr} {\n${members}\n}`;
  }

  get preventSemi() {
    return true;
  }
}

@factory
class ClassMethodNode extends MethodNode {
  constructor(name, params, type, isStatic) {
    super(name, params, type);

    this._static = isStatic;
  }

  _toCode(ctx) {
    const prefix = this._static ? 'static ' : '';

    return `${prefix}${super._toCode(ctx)};`;
  }
}

@factory
class ClassConstructorNode extends ClassMethodNode {
  constructor(params) {
    super('constructor', params, null);
  }
}

@factory
class ClassPropertyNode extends Node {
  constructor(name, type, isStatic) {
    super();

    this._name = name;
    this._type = type;
    this._static = isStatic;
  }

  _toCode() {
    const prefix = this._static ? 'static ' : '';

    return `${prefix}${this._name}: ${this._type};`;
  }
}

function indent({ level, step }) {
  if (level === 0) {
    return id;
  }

  let result = step;
  for (let i = 1; i < indent; i++) {
    result += step;
  }

  return source => result + source;
}

function emptyCtx() {
  return Object.freeze({
    level: 0,
    step: '  ',
    multiVarStep: '  ',
    indent() {
      return Object.freeze({ ...this, level: this.level + 1 });
    }
  });
}

function toCode(ctx) {
  return (node) => node.toCode(ctx);
}

export function createModuleDeclaration(name, nodes) {
  return ModuleDeclarationNode(name, nodes);
}

export function createExportAllFrom(source) {
  return ExportAllFromNode(source);
}

export function createExportDeclaration(decl) {
  return ExportNamedDeclarationNode(decl);
}

export function createVariableDeclaration(kind, decs) {
  return VariableDeclarationNode(kind, decs);
}

export function createVariableDeclarator(name, type) {
  return VariableDeclaratorNode(name, type);
}

export function createExportSpecifier(exported, local) {
  return ExportSpecifierNode(exported, local);
}

export function createExport(specifiers, source) {
  return ExportNode(specifiers, source);
}

export function createParam(name, type, isRest = false) {
  return ParameterNode(name, type, isRest);
}

export function createFunction(name, params, type) {
  return FunctionNode(name, params, type);
}

export function createInterface(name, members, baseInterfaces) {
  return InterfaceNode(name, members, baseInterfaces);
}

export function createInterfaceMethod(name, params, type, isStatic, isOptional) {
  return InterfaceMethodNode(name, params, type, isStatic, isOptional);
}

export function createInterfaceProperty(name, type, isStatic, isOptional) {
  return InterfacePropertyNode(name, type, isStatic, isOptional);
}

export function createInterfaceIndexer(name, keyType, returnType) {
  return InterfaceIndexerNode(name, keyType, returnType);
}

export function createClass(name, superName, members) {
  return ClassNode(name, superName, members);
}

export function createClassConstructor(params) {
  return ClassConstructorNode(params);
}

export function createClassMethod(name, params, type, isStatic) {
  return ClassMethodNode(name, params, type, isStatic);
}

export function createClassProperty(name, type, isStatic) {
  return ClassPropertyNode(name, type, isStatic);
}