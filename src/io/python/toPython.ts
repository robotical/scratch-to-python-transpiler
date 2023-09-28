import Project from "../../Project";
import Script from "../../Script";
import Block, { BlockBase } from "../../Block";
import * as BlockInput from "../../BlockInput";
import { OpCode } from "../../OpCode";

// import * as prettier from "prettier";
// import * as prettier from "prettier/standalone"
// import pythonPlugin from "@prettier/plugin-python";

import Target from "../../Target";
import { List, Variable } from "../../Data";
const NOT_IMPLEMENTED_YET = "# This block is not implemented yet.";
const INDENTATION_RESET_CODE = "%^&*()";
/**
 * Words which are invalid for any Python identifier to be, when it isn't
 * on a namespace (like `this` or `martypy.vars`).
 */
const PYTHON_RESERVED_WORDS = [
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield"
];

/**
 * Input shapes are the basic attribute controlling which of a set of syntaxes
 * is returned for any given block (or primitive value). Provide an input shape
 * to inputToPython to specify what kind of value should be provided as the value
 * in that input. If the content of input does not match the desired shape, for
 * example because it is a block which returns a different type than desired,
 * it will be automatically cast to the correct type for use in the block.
 */
enum InputShape {
  /**
   * Generic shape indicating that any kind of input is acceptable. The input
   * will never be cast, and may be null, undefined, or any Python value.
   */
  Any = "any",

  /**
   * Number input shape. If the input block isn't guaranteed to be a number,
   * it is automatically wrapped with this.toNumber(), which has particular
   * behavior to match Scratch.
   */
  Number = "number",

  /**
   * String input shape. If the input block isn't guaranteed to be a string,
   * it is automatically wrapped with this.toString(), which is just a wrapper
   * around the built-in String() op but is written so for consistency.
   *
   * The string input shape also guarantees that primitive values which could
   * be statically converted to a number, e.g. the string "1.234", will NOT be
   * converted.
   */
  String = "string",

  /**
   * Boolean input shape. If the input block isn't guaranteed to be a boolean,
   * it is automatically wrapped with this.toBoolean(), which has particular
   * behavior to match Scratch. Note that Scratch doesn't have a concept of
   * boolean primitives (no "true" or "false" blocks, nor a "switch" type
   * control for directly inputting true/false as in Snap!).
   */
  Boolean = "boolean",

  /**
   * Special "index" shape, representing an arbitrary number which has been
   * decremented (decreased by 1). Scratch lists are 1-based while Python
   * arrays and strings are indexed starting from 0, so all indexes converted
   * from Scratch must be decreased to match. The "index" shape allows number
   * primitives to be statically decremented, and blocks which include a plus
   * or minus operator to automtaically "absorb" the following decrement.
   */
  Index = "index",

  /**
   * "Stack" block, referring to blocks which can be put one after another and
   * together represent a sequence of steps. Stack inputs may be empty and
   * otherwise are one or more blocks. In Python, there's no fundamental
   * difference between a "function" for reporting values and a "command" for
   * applying effects, so no additional syntax is required to cast any given
   * input value to a stack.
   */
  Stack = "stack"
}

function uniqueNameGenerator(reservedNames: string[] | Set<string> = []) {
  const usedNames: Set<string> = new Set(reservedNames);
  return uniqueName;

  function uniqueName(name): string {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    const numResult = /\d+$/.exec(name);
    if (numResult === null) {
      return uniqueName(name + "2");
    }
    return uniqueName(name.slice(0, numResult.index) + (parseInt(numResult[0], 10) + 1));
  }
}

function camelCase(name: string, upper = false): string {
  const validChars = /[^a-zA-Z0-9]/;
  const ignoredChars = /[']/g;
  let parts = name.replace(ignoredChars, "").split(validChars);
  parts = parts.map(part => part.trim());
  parts = parts.map(part => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase());
  if (!upper) {
    parts[0] = parts[0].toLowerCase();
  }

  let result = parts.join("");

  // A blank string is no good
  if (result.length === 0) {
    result = "_";
  }

  // Variable names cannot start with a number
  if (!isNaN(parseInt(result[0], 10))) {
    result = "_" + result;
  }

  return result;
}

function snake_case(name: string, upper = false): string {
  const valid_chars = /[^a-zA-Z0-9]/;
  const ignored_chars = /[']/g;
  let parts = name.replace(ignored_chars, "").split(valid_chars);
  parts = parts.map(part => part.trim());
  parts = parts.map(part => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase());
  if (!upper) {
    parts[0] = parts[0].toLowerCase();
  }

  let result = parts.join("");

  // A blank string is no good
  if (result.length === 0) {
    result = "_";
  }

  // Variable names cannot start with a number
  if (!isNaN(parseInt(result[0], 10))) {
    result = "_" + result;
  }

  return result;
}

interface ToPythondOptions {
  leopardJSURL: string;
  leopardCSSURL: string;
  getTargetURL: (info: { name: string; from: "index" | "target" }) => string;
  getAssetURL: (info: { type: "costume" | "sound"; target: string; name: string; md5: string; ext: string }) => string;
  indexURL: string;
  autoplay: boolean;
}
export default function toPython(
  options: Partial<ToPythondOptions> = {}
  // prettierConfig: prettier.Options = {}
): string {
  const project: Project = this;

  const defaultOptions: ToPythondOptions = {
    leopardJSURL: "https://unpkg.com/leopard@^1/dist/index.esm.js",
    leopardCSSURL: "https://unpkg.com/leopard@^1/dist/index.min.css",
    getTargetURL: ({ name, from }) => {
      switch (from) {
        case "index":
          return `./${name}/${name}.py`;
        case "target":
          return `../${name}/${name}.py`;
      }
    },
    getAssetURL: ({ type, target, name, ext }) => {
      switch (type) {
        case "costume":
          return `./${target}/costumes/${name}.${ext}`;
        case "sound":
          return `./${target}/sounds/${name}.${ext}`;
      }
    },
    indexURL: "./index.py",
    autoplay: true
  };
  options = { ...defaultOptions, ...options };

  // Sprite identifier must not conflict with module-level/global identifiers,
  // imports and any others that are referenced in generated code.
  //
  // Only classes and similar capitalized namespaces need to be listed here:
  // generated sprite names will never conflict with identifiers whose first
  // letter is lowercase. (This is also why Python reserved words aren't
  // listed here - they're all lowercase, so sprite names won't conflict.)
  const uniqueSpriteName = uniqueNameGenerator(["Color", "Costume", "Sound", "Sprite", "Trigger", "Watcher"]);

  let targetNameMap = {};
  let customBlockArgNameMap: Map<Script, { [key: string]: string }> = new Map();
  let variableNameMap: { [id: string]: string } = {}; // ID to unique (Leopard) name

  for (const target of [project.stage, ...project.sprites]) {
    const newTargetName = uniqueSpriteName(snake_case(target.name, true));
    targetNameMap[target.name] = newTargetName;
    target.setName(newTargetName);

    // Variables are uniquely named per-target. These are on an empty namespace
    // so don't have any conflicts.
    //
    // Note: since variables are serialized as properties on an object (this.vars),
    // these never conflict with reserved Python words like "class" or "new".
    let uniqueVariableName = uniqueNameGenerator();

    for (const { id, name } of [...target.lists, ...target.variables]) {
      const newName = uniqueVariableName(snake_case(name));
      variableNameMap[id] = newName;
    }

    // Scripts are uniquely named per-target. These are on the sprite's main
    // namespace, so must not conflict with properties and methods defined on
    // all sprites/targets by Leopard.
    //
    // The list of reserved names is technically different between BaseSprite,
    // Sprite, and Stage, but all three are considered together here, whatever
    // kind of target will actually be getting script names here.
    //
    // Note: since scripts are serialized as class methods, these never conflict
    // with reserved Python words like "class" or "new" (they're accessed
    // with the same typeof syntax, e.g. this.whenGreenFlagClicked).
    const uniqueScriptName = uniqueNameGenerator([
      // Essential data
      "costumes",
      "effectChain",
      "effects",
      "height",
      "name",
      "sounds",
      "triggers",
      "vars",
      "watchers",
      "width",

      // Other objects
      "andClones",
      "clones",
      "stage",
      "sprites",
      "parent",

      // Motion
      "direction",
      "glide",
      "goto",
      "move",
      "rotationStyle",
      "x",
      "y",

      // Looks
      "costumeNumber",
      "costume",
      "moveAhead",
      "moveBehind",
      "say",
      "sayAndWait",
      "size",
      "think",
      "thinkAndWait",
      "visible",

      // Sounds
      "audioEffects",
      "getSound",
      "getSoundsPlayedByMe",
      "playSoundUntilDone",
      "startSound",
      "stapAllOfMySounds",
      "stopAllSounds",

      // Control & events
      "broadcast",
      "broadcastAndWait",
      "createClone",
      "deleteThisClone",
      "fireBackdropChanged",
      "wait",
      "warp",

      // Opeartors - casting
      "toNumber",
      "toBoolean",
      "toString",
      "compare",

      // Operators - strings
      "stringIncludes",
      "letterOf",

      // Operators - numbers
      "degToRad",
      "degToScratch",
      "radToDeg",
      "radToScratch",
      "random",
      "scratchToDeg",
      "scratchToRad",
      "normalizeDeg",

      // Sensing
      "answer",
      "askAndWait",
      "colorTouching",
      "keyPressed",
      "loudness",
      "mouse",
      "restartTimer",
      "timer",
      "touching",

      // Lists (arrays)
      "arrayIncludes",
      "indexInArray",
      "itemOf",

      // Pen
      "clearPen",
      "penColor",
      "penDown",
      "penSize",
      "stamp"
    ]);

    for (const script of target.scripts) {
      script.setName(uniqueScriptName(snake_case(script.name)));

      const argNameMap = {};
      customBlockArgNameMap.set(script, argNameMap);

      // Parameter names aren't defined on a namespace at all, so must not conflict
      // with Python reserved words.
      const uniqueParamName = uniqueNameGenerator(PYTHON_RESERVED_WORDS);

      for (const block of script.blocks) {
        if (block.opcode === OpCode.procedures_definition) {
          for (const argument of block.inputs.ARGUMENTS.value) {
            if (argument.type !== "label") {
              const newName = uniqueParamName(snake_case(argument.name));
              argNameMap[argument.name] = newName;
              argument.name = newName;
            }
          }
        }
      }
    }
  }

  // Cache a set of variables which are for the stage since whether or not a variable
  // is local has to be known every time any variable block is converted. We check the
  // stage because all non-stage variables are "for this sprite only" and because it's
  // marginally quicker to iterate over a shorter set than a longer one [an assumption
  // made about projects with primarily "for this sprite only" variables].
  const stageVariables: Set<string> = new Set();
  for (const variable of project.stage.variables) {
    stageVariables.add(variable.id);
  }
  for (const list of project.stage.lists) {
    stageVariables.add(list.id);
  }

  function staticBlockInputToLiteral(
    value: string | number | boolean | object,
    desiredInputShape?: InputShape
  ): string {
    // Short-circuit for string inputs. These must never return number syntax.
    if (desiredInputShape === "string") {
      return JSON.stringify(value);
    }

    // Other input shapes which static inputs may fulfill: number, index, any.
    // These are all OK to return Python number literals for.
    const asNum = Number(value as string);
    if (!isNaN(asNum) && value !== "") {
      if (desiredInputShape === "index") {
        return JSON.stringify(asNum - 1);
      } else {
        return JSON.stringify(asNum);
      }
    }

    return JSON.stringify(value);
  }

  function triggerInitCode(script: Script, target: Target): string | null {
    const hat = script.hat;

    if (hat === null) {
      return null;
    }

    const triggerInitStr = (name: string, options?: Partial<Record<string, string>>): string => {
      let optionsStr = "";
      if (options) {
        const optionValues = [];
        for (const [optionName, optionValue] of Object.entries(options)) {
          optionValues.push(`${optionName}: ${optionValue}`);
        }
        optionsStr = `, {${optionValues.join(", ")}}`;
      }
      return `new Trigger(Trigger.${name}${optionsStr}, this.${script.name})`;
    };

    switch (hat.opcode) {
      case OpCode.event_whenflagclicked:
        return triggerInitStr("GREEN_FLAG");
      case OpCode.event_whenkeypressed:
        return triggerInitStr("KEY_PRESSED", { key: JSON.stringify(hat.inputs.KEY_OPTION.value) });
      case OpCode.event_whenthisspriteclicked:
      case OpCode.event_whenstageclicked:
        return triggerInitStr("CLICKED");
      case OpCode.event_whenbroadcastreceived:
        return triggerInitStr("BROADCAST", { name: JSON.stringify(hat.inputs.BROADCAST_OPTION.value) });
      case OpCode.event_whengreaterthan: {
        const valueInput = hat.inputs.VALUE as BlockInput.Any;
        // If the "greater than" value is a literal, we can include it directly.
        // Otherwise, it's a block that may depend on sprite state and needs to
        // be a function.
        const value =
          valueInput.type === "block"
            ? `() => ${blockToPythonWithContext(valueInput.value, target)}`
            : staticBlockInputToLiteral(valueInput.value, InputShape.Number);
        return triggerInitStr(`${hat.inputs.WHENGREATERTHANMENU.value}_GREATER_THAN`, {
          VALUE: value
        });
      }
      case OpCode.control_start_as_clone:
        return triggerInitStr("CLONE_START");
      default:
        return null;
    }
  }

  function scriptToPython(script: Script, target: Target): string {
    const body = script.body.map(block => blockToPythonWithContext(block, target, script)).join("\n");
    if (script.hat && script.hat.opcode === OpCode.procedures_definition) {
      return `
        * ${script.name}(${script.hat.inputs.ARGUMENTS.value
          .filter(arg => arg.type !== "label")
          .map(arg => arg.name)
          .join(", ")}) {
          ${body}
        }
      `;
    }
    return `
      ${body}
    `;
  }

  function blockToPythonWithContext(block: Block, target: Target, script?: Script): string {
    return blockToPython(block);

    function increase(leftSide: string, input: BlockInput.Any, allowIncrementDecrement: boolean) {
      const n = parseNumber(input);
      if (n === null) {
        return `${leftSide} += (${inputToPython(input, InputShape.Number)})`;
      }

      if (allowIncrementDecrement && n === 1) {
        return `${leftSide} += 1`;
      } else if (allowIncrementDecrement && n === -1) {
        return `${leftSide} -= 1`;
      } else if (n >= 0) {
        return `${leftSide} += ${JSON.stringify(n)}`;
      } else if (n < 0) {
        return `${leftSide} -= ${JSON.stringify(-n)}`;
      }
    }

    function decrease(leftSide: string, input: BlockInput.Any, allowIncrementDecrement: boolean) {
      const n = parseNumber(input);
      if (n === null) {
        return `${leftSide} -= (${inputToPython(input, InputShape.Number)})`;
      }

      if (allowIncrementDecrement && n === 1) {
        return `${leftSide}--`;
      } else if (allowIncrementDecrement && n === -1) {
        return `${leftSide}++`;
      } else if (n > 0) {
        return `${leftSide} -= ${JSON.stringify(n)}`;
      } else if (n <= 0) {
        return `${leftSide} += ${JSON.stringify(-n)}`;
      }
    }

    function parseNumber(input: BlockInput.Any): number | null {
      // Returns a number if the input was a primitive (static) value and was
      // able to be parsed as a number; otherwise, returns null.

      if (input.type === "block") {
        return null;
      }

      const n = Number(input.value);

      if (isNaN(n)) {
        return null;
      }

      return n;
    }

    function inputToPython(input: BlockInput.Any, desiredInputShape: InputShape): string {
      // TODO: Right now, inputs can be completely undefined if imported from
      // the .sb3 format (because sb3 is weird). This little check will replace
      // undefined inputs with the value `null`. In theory, this should
      // eventually be removed when the sb3 import script is improved.
      if (input === undefined) {
        return "NoneType";
      }

      switch (input.type) {
        case "block":
          return blockToPython(input.value as Block, desiredInputShape);
        case "blocks":
          return input.value.map(block => blockToPython(block as Block)).join("\n");
        default: {
          return staticBlockInputToLiteral(input.value, desiredInputShape);
        }
      }
    }

    function blockToPython(block: Block, desiredInputShape?: InputShape): string {
      const warp =
        script && script.hat && script.hat.opcode === OpCode.procedures_definition && script.hat.inputs.WARP.value;

      // If the block contains a variable or list dropdown,
      // get the code to grab that variable now for convenience
      let selectedVarSource: string = null;
      let selectedWatcherSource: string = null;
      let varInputId: string = null;
      if ("VARIABLE" in block.inputs) {
        varInputId = (block.inputs.VARIABLE.value as { id: string }).id;
      } else if ("LIST" in block.inputs) {
        varInputId = (block.inputs.LIST.value as { id: string }).id;
      }
      if (varInputId) {
        const newName = variableNameMap[varInputId];
        if (target === project.stage || !stageVariables.has(varInputId)) {
          selectedVarSource = `${newName}`;
          selectedWatcherSource = `${newName}`;
        } else {
          selectedVarSource = `${newName}`;
          selectedWatcherSource = `${newName}`;
        }
      }

      const stage = "" + (target.isStage ? "" : "");

      let satisfiesInputShape: InputShape = null;
      let blockSource: string = null;

      switch (block.opcode) {
        case OpCode.motion_movesteps:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_turnright:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_turnleft:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_goto:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_gotoxy:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_glideto: {
          blockSource = NOT_IMPLEMENTED_YET;
          break;
        }

        case OpCode.motion_glidesecstoxy:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_pointindirection:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_pointtowards: {
          blockSource = NOT_IMPLEMENTED_YET;
          break;
        }

        case OpCode.motion_changexby:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_setx:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_changeyby:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_sety:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_setrotationstyle:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_xposition:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_yposition:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_direction:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        // Obsolete no-op blocks:
        case OpCode.motion_scroll_right:
        case OpCode.motion_scroll_up:
        case OpCode.motion_align_scene:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.motion_xscroll:
        case OpCode.motion_yscroll:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.looks_sayforsecs:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.sayAndWait((${inputToPython(block.inputs.MESSAGE, InputShape.Any)}), (${inputToPython(
            block.inputs.SECS,
            InputShape.Number
          )}))`;
          break;

        case OpCode.looks_say:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.say(${inputToPython(block.inputs.MESSAGE, InputShape.Any)})`;
          break;

        case OpCode.looks_thinkforsecs:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.thinkAndWait((${inputToPython(block.inputs.MESSAGE, InputShape.Any)}), (${inputToPython(
            block.inputs.SECS,
            InputShape.Number
          )}))`;
          break;

        case OpCode.looks_think:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.think(${inputToPython(block.inputs.MESSAGE, InputShape.Any)})`;
          break;

        case OpCode.looks_switchcostumeto:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.costume = (${inputToPython(block.inputs.COSTUME, InputShape.Any)})`;
          break;

        case OpCode.looks_nextcostume:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.costumeNumber++`;
          break;

        case OpCode.looks_switchbackdropto:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${stage}.costume = (${inputToPython(block.inputs.BACKDROP, InputShape.Any)})`;
          break;

        case OpCode.looks_nextbackdrop:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${stage}.costumeNumber++`;
          break;

        case OpCode.looks_changesizeby:
          satisfiesInputShape = InputShape.Stack;
          blockSource = increase(`martypy.size`, block.inputs.CHANGE, false);
          break;

        case OpCode.looks_setsizeto:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.size = (${inputToPython(block.inputs.SIZE, InputShape.Number)})`;
          break;

        case OpCode.looks_changeeffectby: {
          const effectName = block.inputs.EFFECT.value.toLowerCase();
          satisfiesInputShape = InputShape.Stack;
          blockSource = increase(`martypy.effects.${effectName}`, block.inputs.CHANGE, false);
          break;
        }

        case OpCode.looks_seteffectto: {
          const effectName = block.inputs.EFFECT.value.toLowerCase();
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.effects.${effectName} = ${inputToPython(block.inputs.VALUE, InputShape.Number)}`;
          break;
        }

        case OpCode.looks_cleargraphiceffects:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.effects.clear()`;
          break;

        case OpCode.looks_show:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.visible = true`;
          break;

        case OpCode.looks_hide:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.visible = false`;
          break;

        case OpCode.looks_gotofrontback:
          satisfiesInputShape = InputShape.Stack;
          if (block.inputs.FRONT_BACK.value === "front") {
            blockSource = `martypy.moveAhead()`;
          } else {
            blockSource = `martypy.moveBehind()`;
          }
          break;

        case OpCode.looks_goforwardbackwardlayers:
          satisfiesInputShape = InputShape.Stack;
          if (block.inputs.FORWARD_BACKWARD.value === "forward") {
            blockSource = `martypy.moveAhead(${inputToPython(block.inputs.NUM, InputShape.Number)})`;
          } else {
            blockSource = `martypy.moveBehind(${inputToPython(block.inputs.NUM, InputShape.Number)})`;
          }
          break;

        // Obsolete no-op blocks:
        case OpCode.looks_hideallsprites:
        case OpCode.looks_changestretchby:
        case OpCode.looks_setstretchto:
          satisfiesInputShape = InputShape.Stack;
          blockSource = ``;
          break;

        case OpCode.looks_costumenumbername:
          switch (block.inputs.NUMBER_NAME.value) {
            case "name":
              satisfiesInputShape = InputShape.String;
              blockSource = `martypy.costume.name`;
              break;
            case "number":
            default:
              satisfiesInputShape = InputShape.Number;
              blockSource = `martypy.costumeNumber`;
              break;
          }
          break;

        case OpCode.looks_backdropnumbername:
          switch (block.inputs.NUMBER_NAME.value) {
            case "name":
              satisfiesInputShape = InputShape.String;
              blockSource = `${stage}.costume.name`;
              break;
            case "number":
            default:
              satisfiesInputShape = InputShape.Number;
              blockSource = `${stage}.costumeNumber`;
              break;
          }
          break;

        case OpCode.looks_size:
          satisfiesInputShape = InputShape.Number;
          blockSource = `martypy.size`;
          break;

        case OpCode.sound_playuntildone:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.playSoundUntilDone(${inputToPython(block.inputs.SOUND_MENU, InputShape.Any)})`;
          break;

        case OpCode.sound_play:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.startSound(${inputToPython(block.inputs.SOUND_MENU, InputShape.Any)})`;
          break;

        case OpCode.sound_setvolumeto:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.audioEffects.volume = ${inputToPython(block.inputs.VOLUME, InputShape.Number)}`;
          break;

        case OpCode.sound_changevolumeby:
          satisfiesInputShape = InputShape.Stack;
          blockSource = increase(`martypy.audioEffects.volume`, block.inputs.VOLUME, false);
          break;

        case OpCode.sound_volume:
          satisfiesInputShape = InputShape.Number;
          blockSource = `martypy.audioEffects.volume`;
          break;

        case OpCode.sound_seteffectto: {
          satisfiesInputShape = InputShape.Stack;
          const value = inputToPython(block.inputs.VALUE, InputShape.Number);
          if (block.inputs.EFFECT.type === "soundEffect") {
            blockSource = `martypy.audioEffects.${block.inputs.EFFECT.value.toLowerCase()} = ${value}`;
          } else {
            blockSource = `martypy.audioEffects[${inputToPython(block.inputs.EFFECT, InputShape.Any)}] = ${value}`;
          }
          break;
        }

        case OpCode.sound_changeeffectby: {
          satisfiesInputShape = InputShape.Stack;
          const value = block.inputs.VALUE;
          if (block.inputs.EFFECT.type === "soundEffect") {
            blockSource = increase(`martypy.audioEffects.${block.inputs.EFFECT.value.toLowerCase()}`, value, false);
          } else {
            blockSource = increase(
              `martypy.audioEffects[${inputToPython(block.inputs.EFFECT, InputShape.Any)}]`,
              value,
              false
            );
          }
          break;
        }

        case OpCode.sound_cleareffects:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.audioEffects.clear()`;
          break;

        case OpCode.sound_stopallsounds:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.stopAllSounds()`;
          break;

        case OpCode.event_broadcast:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.broadcast(${inputToPython(block.inputs.BROADCAST_INPUT, InputShape.String)})`;
          break;

        case OpCode.event_broadcastandwait:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.broadcastAndWait(${inputToPython(block.inputs.BROADCAST_INPUT, InputShape.String)})`;
          break;

        case OpCode.control_wait:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `time.sleep(${inputToPython(block.inputs.DURATION, InputShape.Number)})`;
          break;

        case OpCode.control_repeat:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `for i in range(${inputToPython(block.inputs.TIMES, InputShape.Number)}):
          ${inputToPython(block.inputs.SUBSTACK, InputShape.Stack)}
            ${warp ? "" : INDENTATION_RESET_CODE}`;
          break;

        case OpCode.control_forever:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `while True:
            ${inputToPython(block.inputs.SUBSTACK, InputShape.Stack)}
            ${warp ? "" : INDENTATION_RESET_CODE} 
          `;
          break;

        case OpCode.control_if:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `if ${inputToPython(block.inputs.CONDITION, InputShape.Boolean)}:
        ${inputToPython(block.inputs.SUBSTACK, InputShape.Stack)}`;
          break;

        case OpCode.control_if_else:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `if ${inputToPython(block.inputs.CONDITION, InputShape.Boolean)}:
            ${inputToPython(block.inputs.SUBSTACK, InputShape.Stack)}
          else:
            ${inputToPython(block.inputs.SUBSTACK2, InputShape.Stack)}`;
          break;

        case OpCode.control_wait_until:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `while not ${inputToPython(block.inputs.CONDITION, InputShape.Boolean)}:  
              `;
          break;

        case OpCode.control_repeat_until:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `while not ${inputToPython(block.inputs.CONDITION, InputShape.Boolean)}:
            ${inputToPython(block.inputs.SUBSTACK, InputShape.Stack)}
            ${warp ? "" : INDENTATION_RESET_CODE}`;
          break;

        case OpCode.control_while:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `while ${inputToPython(block.inputs.CONDITION, InputShape.Boolean)}:
            ${inputToPython(block.inputs.SUBSTACK, InputShape.Stack)}
            ${warp ? "" : INDENTATION_RESET_CODE}
          `;
          break;

        case OpCode.control_for_each:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `for (${selectedVarSource} = 1; ${selectedVarSource} <= (${inputToPython(
            block.inputs.VALUE,
            InputShape.Number
          )}) ${selectedVarSource}++) {
            ${inputToPython(block.inputs.SUBSTACK, InputShape.Stack)}
            ${warp ? "" : INDENTATION_RESET_CODE}
          }`;
          break;

        case OpCode.control_all_at_once:
          satisfiesInputShape = InputShape.Stack;
          blockSource = inputToPython(block.inputs.SUBSTACK, InputShape.Stack);
          break;

        case OpCode.control_stop:
          satisfiesInputShape = InputShape.Stack;
          switch (block.inputs.STOP_OPTION.value) {
            case "this script":
              blockSource = `return`;
              break;
            default:
              blockSource = `# TODO: Implement stop ${block.inputs.STOP_OPTION.value}`;
              break;
          }
          break;

        case OpCode.control_create_clone_of:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.control_delete_this_clone:
          blockSource = NOT_IMPLEMENTED_YET;
          break;

        case OpCode.control_get_counter:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${stage}.__counter`;
          break;

        case OpCode.control_incr_counter:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${stage}.__counter++`;
          break;

        case OpCode.control_clear_counter:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${stage}.__counter = 0`;
          break;

        case OpCode.sensing_touchingobject:
          satisfiesInputShape = InputShape.Boolean;
          switch (block.inputs.TOUCHINGOBJECTMENU.value) {
            case "_mouse_":
              blockSource = `martypy.touching("mouse")`;
              break;
            case "_edge_":
              blockSource = `martypy.touching("edge")`;
              break;
            default:
              blockSource = `martypy.touching(this.sprites[${JSON.stringify(
                targetNameMap[block.inputs.TOUCHINGOBJECTMENU.value]
              )}].andClones())`;
              break;
          }
          break;

        case OpCode.sensing_touchingcolor:
          satisfiesInputShape = InputShape.Boolean;
          if (block.inputs.COLOR.type === "color") {
            const { r, g, b } = block.inputs.COLOR.value;
            blockSource = `martypy.touching(Color.rgb(${r}, ${g}, ${b}))`;
          } else {
            blockSource = `martypy.touching(Color.num(${inputToPython(block.inputs.COLOR, InputShape.Number)}))`;
          }
          break;

        case OpCode.sensing_coloristouchingcolor: {
          let color1: string;
          let color2: string;

          if (block.inputs.COLOR.type === "color") {
            const { r, g, b } = block.inputs.COLOR.value;
            color1 = `Color.rgb(${r}, ${g}, ${b})`;
          } else {
            color1 = `Color.num(${inputToPython(block.inputs.COLOR, InputShape.Number)})`;
          }

          if (block.inputs.COLOR2.type === "color") {
            const { r, g, b } = block.inputs.COLOR2.value;
            color2 = `Color.rgb(${r}, ${g}, ${b})`;
          } else {
            color2 = `Color.num(${inputToPython(block.inputs.COLOR2, InputShape.Number)})`;
          }

          satisfiesInputShape = InputShape.Boolean;
          blockSource = `martypy.colorTouching((${color1}), (${color2}))`;
          break;
        }

        case OpCode.sensing_distanceto: {
          let coords: string;

          switch (block.inputs.DISTANCETOMENU.value) {
            case "_mouse_":
              coords = `martypy.mouse`;
              break;
            default:
              coords = `martypy.sprites[${JSON.stringify(targetNameMap[block.inputs.DISTANCETOMENU.value])}]`;
              break;
          }

          satisfiesInputShape = InputShape.Number;
          blockSource = `(Math.hypot(${coords}.x - this.x, ${coords}.y - this.y))`;
          break;
        }

        case OpCode.sensing_askandwait:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.askAndWait(${inputToPython(block.inputs.QUESTION, InputShape.Any)})`;
          break;

        case OpCode.sensing_answer:
          satisfiesInputShape = InputShape.String;
          blockSource = `martypy.answer`;
          break;

        case OpCode.sensing_keypressed:
          satisfiesInputShape = InputShape.Boolean;
          blockSource = `martypy.keyPressed(${inputToPython(block.inputs.KEY_OPTION, InputShape.String)})`;
          break;

        case OpCode.sensing_mousedown:
          satisfiesInputShape = InputShape.Boolean;
          blockSource = `martypy.mouse.down`;
          break;
        case OpCode.sensing_mousex:
          satisfiesInputShape = InputShape.Number;
          blockSource = `martypy.mouse.x`;
          break;

        case OpCode.sensing_mousey:
          satisfiesInputShape = InputShape.Number;
          blockSource = `martypy.mouse.y`;
          break;

        case OpCode.sensing_loudness:
          satisfiesInputShape = InputShape.Number;
          blockSource = `martypy.loudness`;
          break;

        case OpCode.sensing_timer:
          satisfiesInputShape = InputShape.Number;
          blockSource = `martypy.timer`;
          break;

        case OpCode.sensing_resettimer:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.restartTimer()`;
          break;

        case OpCode.sensing_of: {
          let propName: string;
          switch (block.inputs.PROPERTY.value) {
            case "x position":
              propName = "x";
              satisfiesInputShape = InputShape.Number;
              break;
            case "y position":
              propName = "y";
              satisfiesInputShape = InputShape.Number;
              break;
            case "direction":
              propName = "direction";
              satisfiesInputShape = InputShape.Number;
              break;
            case "costume #":
            case "backdrop #":
              propName = "costumeNumber";
              satisfiesInputShape = InputShape.Number;
              break;
            case "costume name":
            case "backdrop name":
              propName = "costume.name";
              satisfiesInputShape = InputShape.String;
              break;
            case "size":
              propName = "size";
              satisfiesInputShape = InputShape.Number;
              break;
            case "volume":
              propName = null;
              break;
            default: {
              let varOwner: Target = project.stage;
              if (block.inputs.OBJECT.value !== "_stage_") {
                varOwner = project.sprites.find(sprite => sprite.name === targetNameMap[block.inputs.OBJECT.value]);
              }
              // "of" block gets variables by name, not ID, using lookupVariableByNameAndType in scratch-vm.
              const variable = varOwner.variables.find(variable => variable.name === block.inputs.PROPERTY.value);
              const newName = variableNameMap[variable.id];
              propName = `vars.${newName}`;
              satisfiesInputShape = InputShape.Any;
              break;
            }
          }

          if (propName === null) {
            blockSource = `# Cannot access property ${block.inputs.PROPERTY.value} of target`;
            break;
          }

          let targetObj: string;
          if (block.inputs.OBJECT.value === "_stage_") {
            targetObj = `martypy.stage`;
          } else {
            targetObj = `martypy.sprites[${JSON.stringify(targetNameMap[block.inputs.OBJECT.value])}]`;
          }

          blockSource = `${targetObj}.${propName}`;
          break;
        }

        case OpCode.sensing_current:
          satisfiesInputShape = InputShape.Number;
          switch (block.inputs.CURRENTMENU.value) {
            case "YEAR":
              blockSource = `(new Date().getFullYear())`;
              break;
            case "MONTH":
              blockSource = `(new Date().getMonth() + 1)`;
              break;
            case "DATE":
              blockSource = `(new Date().getDate())`;
              break;
            case "DAYOFWEEK":
              blockSource = `(new Date().getDay() + 1)`;
              break;
            case "HOUR":
              blockSource = `(new Date().getHours())`;
              break;
            case "MINUTE":
              blockSource = `(new Date().getMinutes())`;
              break;
            case "SECOND":
              blockSource = `(new Date().getSeconds())`;
              break;
            default:
              blockSource = `('')`;
              break;
          }
          break;

        case OpCode.sensing_dayssince2000:
          satisfiesInputShape = InputShape.Number;
          blockSource = `(((new Date().getTime() - new Date(2000, 0, 1)) / 1000 / 60 + new Date().getTimezoneOffset()) / 60 / 24)`;
          break;

        case OpCode.sensing_username:
          satisfiesInputShape = InputShape.String;
          blockSource = `(/* no username */ "")`;
          break;

        case OpCode.sensing_userid:
          satisfiesInputShape = InputShape.Any;
          blockSource = `undefined`; // Obsolete no-op block.
          break;

        case OpCode.operator_add:
          if (desiredInputShape === InputShape.Index) {
            // Attempt to fulfill a desired index input by subtracting 1 from either side
            // of the block. If neither side can be parsed as a number (i.e. both inputs
            // are filled with blocks), this clause just falls back to the normal number
            // shape.
            const num2 = parseNumber(block.inputs.NUM2);
            if (typeof num2 === "number") {
              if (num2 === 1) {
                satisfiesInputShape = InputShape.Index;
                blockSource = `(${inputToPython(block.inputs.NUM1, InputShape.Number)})`;
                break;
              } else {
                satisfiesInputShape = InputShape.Index;
                blockSource = `((${inputToPython(block.inputs.NUM1, InputShape.Number)}) + ${num2 - 1})`;
                break;
              }
            } else {
              const num1 = parseNumber(block.inputs.NUM1);
              if (typeof num1 === "number") {
                if (num1 === 1) {
                  satisfiesInputShape = InputShape.Index;
                  blockSource = `(${inputToPython(block.inputs.NUM2, InputShape.Number)})`;
                  break;
                } else {
                  satisfiesInputShape = InputShape.Index;
                  blockSource = `(${num1 - 1} + ${inputToPython(block.inputs.NUM2, InputShape.Number)})`;
                  break;
                }
              }
            }
          }

          satisfiesInputShape = InputShape.Number;
          blockSource = `((${inputToPython(block.inputs.NUM1, InputShape.Number)}) + (${inputToPython(
            block.inputs.NUM2,
            InputShape.Number
          )}))`;
          break;

        case OpCode.operator_subtract:
          if (desiredInputShape === InputShape.Index) {
            // Do basically the same thing as the addition operator does, but with
            // specifics for subtraction: increment the right-hand or decrement the
            // left-hand.
            const num2 = parseNumber(block.inputs.NUM2);
            if (typeof num2 === "number") {
              if (num2 === -1) {
                satisfiesInputShape = InputShape.Index;
                blockSource = `(${inputToPython(block.inputs.NUM1, InputShape.Number)})`;
                break;
              } else {
                satisfiesInputShape = InputShape.Index;
                blockSource = `((${inputToPython(block.inputs.NUM1, InputShape.Number)}) - ${num2 + 1})`;
                break;
              }
            } else {
              const num1 = parseNumber(block.inputs.NUM1);
              if (typeof num1 === "number") {
                if (num1 === 1) {
                  // (1 - x) -> (0 - x) == (-x)
                  satisfiesInputShape = InputShape.Index;
                  blockSource = `(-${inputToPython(block.inputs.NUM2, InputShape.Number)})`;
                  break;
                } else {
                  satisfiesInputShape = InputShape.Index;
                  blockSource = `(${num1 - 1} + ${inputToPython(block.inputs.NUM2, InputShape.Number)})`;
                  break;
                }
              }
            }
          }

          satisfiesInputShape = InputShape.Number;
          blockSource = `((${inputToPython(block.inputs.NUM1, InputShape.Number)}) - (${inputToPython(
            block.inputs.NUM2,
            InputShape.Number
          )}))`;
          break;

        case OpCode.operator_multiply:
          satisfiesInputShape = InputShape.Number;
          blockSource = `((${inputToPython(block.inputs.NUM1, InputShape.Number)}) * (${inputToPython(
            block.inputs.NUM2,
            InputShape.Number
          )}))`;
          break;

        case OpCode.operator_divide:
          satisfiesInputShape = InputShape.Number;
          blockSource = `((${inputToPython(block.inputs.NUM1, InputShape.Number)}) / (${inputToPython(
            block.inputs.NUM2,
            InputShape.Number
          )}))`;
          break;

        case OpCode.operator_random:
          satisfiesInputShape = InputShape.Number;
          blockSource = `random.randint(${inputToPython(block.inputs.FROM, InputShape.Number)}, ${inputToPython(
            block.inputs.TO,
            InputShape.Number
          )}) # import random`;
          break;

        case OpCode.operator_gt:
          satisfiesInputShape = InputShape.Boolean;
          blockSource = `((${inputToPython(block.inputs.OPERAND1, InputShape.Any)}) > (${inputToPython(
            block.inputs.OPERAND2,
            InputShape.Any
          )}))`;
          break;

        case OpCode.operator_lt:
          satisfiesInputShape = InputShape.Boolean;
          blockSource = `((${inputToPython(block.inputs.OPERAND1, InputShape.Any)}) < (${inputToPython(
            block.inputs.OPERAND2,
            InputShape.Any
          )}))`;
          break;

        case OpCode.operator_equals: {
          satisfiesInputShape = InputShape.Boolean;

          // If both sides are blocks, we can't make any assumptions about what kind of
          // values are being compared.(*) Use the custom .compare() function to ensure
          // compatibility with Scratch's equals block.
          //
          // (*) This is theoretically false, but we currently don't have a way to inspect
          // the returned InputShape of a block input to see if both sides match up.

          if (
            (block.inputs.OPERAND1 as BlockInput.Any).type === "block" &&
            (block.inputs.OPERAND2 as BlockInput.Any).type === "block"
          ) {
            blockSource = `(this.compare((${inputToPython(block.inputs.OPERAND1, InputShape.Any)}), (${inputToPython(
              block.inputs.OPERAND2,
              InputShape.Any
            )})) === 0)`;
            break;
          }

          // If both inputs were blocks, that was caught above - so from this point on,
          // either the left- or right-hand side is definitely a primitive (or both).

          const num1 = parseNumber(block.inputs.OPERAND1);
          if (typeof num1 === "number") {
            blockSource = `(${num1} === (${inputToPython(block.inputs.OPERAND2, InputShape.Number)}))`;
            break;
          }

          const num2 = parseNumber(block.inputs.OPERAND2);
          if (typeof num2 === "number") {
            blockSource = `((${inputToPython(block.inputs.OPERAND1, InputShape.Number)}) === ${num2})`;
            break;
          }

          // If neither side was parsed as a number, one side is definitely a string.
          // Compare both sides as strings.

          blockSource = `((${inputToPython(block.inputs.OPERAND1, InputShape.String)}) == (${inputToPython(
            block.inputs.OPERAND2,
            InputShape.String
          )}))`;

          break;
        }

        case OpCode.operator_and:
          satisfiesInputShape = InputShape.Boolean;
          blockSource = `((${inputToPython(block.inputs.OPERAND1, InputShape.Boolean)}) and (${inputToPython(
            block.inputs.OPERAND2,
            InputShape.Boolean
          )}))`;
          break;

        case OpCode.operator_or:
          satisfiesInputShape = InputShape.Boolean;
          blockSource = `((${inputToPython(block.inputs.OPERAND1, InputShape.Boolean)}) or (${inputToPython(
            block.inputs.OPERAND2,
            InputShape.Boolean
          )}))`;
          break;

        case OpCode.operator_not:
          satisfiesInputShape = InputShape.Boolean;
          blockSource = `(not (${inputToPython(block.inputs.OPERAND, InputShape.Boolean)}))`;
          break;

        case OpCode.operator_join:
          satisfiesInputShape = InputShape.String;
          blockSource = `((${inputToPython(block.inputs.STRING1, InputShape.String)}) + (${inputToPython(
            block.inputs.STRING2,
            InputShape.String
          )}))`;
          break;

        case OpCode.operator_letter_of:
          satisfiesInputShape = InputShape.String;
          blockSource = `${inputToPython(block.inputs.STRING, InputShape.Any)}[${inputToPython(
            block.inputs.LETTER,
            InputShape.Index
          )}]`;
          break;

        case OpCode.operator_length:
          satisfiesInputShape = InputShape.Number;
          blockSource = `len(${inputToPython(block.inputs.STRING, InputShape.String)})`;
          break;

        case OpCode.operator_contains:
          satisfiesInputShape = InputShape.Boolean;
          blockSource = `${inputToPython(
            block.inputs.STRING2,
            InputShape.String
          )} in ${inputToPython(block.inputs.STRING1, InputShape.String)}`;
          break;

        case OpCode.operator_mod:
          satisfiesInputShape = InputShape.Number;
          blockSource = `((${inputToPython(block.inputs.NUM1, InputShape.Number)}) % (${inputToPython(
            block.inputs.NUM2,
            InputShape.Number
          )}))`;
          break;

        case OpCode.operator_round:
          satisfiesInputShape = InputShape.Number;
          blockSource = `round(${inputToPython(block.inputs.NUM, InputShape.Number)})`;
          break;

        case OpCode.operator_mathop: {
          const inputSource = inputToPython(block.inputs.NUM, InputShape.Number);
          satisfiesInputShape = InputShape.Number;
          switch (block.inputs.OPERATOR.value) {
            case "abs":
              blockSource = `abs(${inputSource})`;
              break;
            case "floor":
              blockSource = `math.floor(${inputSource}) # import math`;
              break;
            case "ceiling":
              blockSource = `math.ceil(${inputSource}) # import math`;
              break;
            case "sqrt":
              blockSource = `math.sqrt(${inputSource}) # import math`;
              break;
            case "sin":
              blockSource = `math.sin(math.radians(${inputSource})) # import math`;
              break;
            case "cos":
              blockSource = `math.cos(math.radians(${inputSource})) # import math`;
              break;
            case "tan":
              blockSource = `math.tan(${inputSource})`;
              break;
            case "asin":
              blockSource = `math.degrees(math.asin(${inputSource})) # import math`;
              break;
            case "acos":
              blockSource = `math.degrees(math.acos(${inputSource})) # import math`;
              break;
            case "atan":
              blockSource = `math.degrees(math.atan(${inputSource})) # import math`;
              break;
            case "ln":
              blockSource = `math.log(${inputSource}) # import math`;
              break;
            case "log":
              blockSource = `math.log10(${inputSource}) # import math`;
              break;
            case "e ^":
              blockSource = `math.exp(${inputSource}) # import math`;
              break;
            case "10 ^":
              blockSource = `(10 ** (${inputSource}))`;
              break;
          }
          break;
        }

        case OpCode.data_variable:
          satisfiesInputShape = InputShape.Stack;
          blockSource = selectedVarSource;
          break;

        case OpCode.data_setvariableto:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${selectedVarSource} = (${inputToPython(block.inputs.VALUE, InputShape.Any)})`;
          break;

        case OpCode.data_changevariableby:
          satisfiesInputShape = InputShape.Stack;
          blockSource = increase(selectedVarSource, block.inputs.VALUE, true);
          break;

        case OpCode.data_showvariable:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${selectedWatcherSource}.visible = true`;
          break;

        case OpCode.data_hidevariable:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${selectedWatcherSource}.visible = false`;
          break;

        case OpCode.data_listcontents:
          satisfiesInputShape = InputShape.String;
          blockSource = `${selectedVarSource}.join(" ")`;
          break;

        case OpCode.data_addtolist:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${selectedVarSource}.push(${inputToPython(block.inputs.ITEM, InputShape.Any)})`;
          break;

        case OpCode.data_deleteoflist:
          satisfiesInputShape = InputShape.Stack;
          // Supposed to be a numerical index, but can be
          // string "all" when sb2 converted to sb3 by Scratch
          if (block.inputs.INDEX.value === "all") {
            blockSource = `${selectedVarSource} = []`;
          } else if (block.inputs.INDEX.value === "last") {
            blockSource = `${selectedVarSource}.splice(${selectedVarSource}.length - 1, 1)`;
          } else {
            blockSource = `${selectedVarSource}.splice((${inputToPython(block.inputs.INDEX, InputShape.Index)}), 1)`;
          }
          break;

        case OpCode.data_deletealloflist:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${selectedVarSource} = []`;
          break;

        case OpCode.data_insertatlist: {
          const index = inputToPython(block.inputs.INDEX, InputShape.Index);
          const item = inputToPython(block.inputs.ITEM, InputShape.Any);
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${selectedVarSource}.splice(${index}, 0, ${item})`;
          break;
        }

        case OpCode.data_replaceitemoflist: {
          const index = inputToPython(block.inputs.INDEX, InputShape.Index);
          const item = inputToPython(block.inputs.ITEM, InputShape.Any);
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${selectedVarSource}.splice(${index}, 1, ${item})`;
          break;
        }

        case OpCode.data_itemoflist:
          satisfiesInputShape = InputShape.Any;
          if (block.inputs.INDEX.value === "last") {
            blockSource = `martypy.itemOf(${selectedVarSource}, ${selectedVarSource}.length - 1)`;
          } else {
            blockSource = `martypy.itemOf(${selectedVarSource}, ${inputToPython(block.inputs.INDEX, InputShape.Index)})`;
          }
          break;

        case OpCode.data_itemnumoflist:
          if (desiredInputShape === InputShape.Index) {
            satisfiesInputShape = InputShape.Index;
            blockSource = `martypy.indexInArray(${selectedVarSource}, ${inputToPython(block.inputs.ITEM, InputShape.Any)})`;
          } else {
            satisfiesInputShape = InputShape.Number;
            blockSource = `(this.indexInArray(${selectedVarSource}, ${inputToPython(
              block.inputs.ITEM,
              InputShape.Any
            )}) + 1)`;
          }
          break;

        case OpCode.data_lengthoflist:
          satisfiesInputShape = InputShape.Number;
          blockSource = `${selectedVarSource}.length`;
          break;

        case OpCode.data_listcontainsitem:
          satisfiesInputShape = InputShape.Boolean;
          blockSource = `martypy.arrayIncludes(${selectedVarSource}, ${inputToPython(block.inputs.ITEM, InputShape.Any)})`;
          break;

        case OpCode.data_showlist:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${selectedWatcherSource}.visible = true`;
          break;

        case OpCode.data_hidelist:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `${selectedWatcherSource}.visible = false`;
          break;

        case OpCode.procedures_call: {
          satisfiesInputShape = InputShape.Stack;

          // Get name of custom block script with given PROCCODE:
          const procName = target.scripts.find(
            script =>
              script.hat !== null &&
              script.hat.opcode === OpCode.procedures_definition &&
              script.hat.inputs.PROCCODE.value === block.inputs.PROCCODE.value
          ).name;

          // TODO: Boolean inputs should provide appropriate desiredInputShape instead of "any"
          const procArgs = `${block.inputs.INPUTS.value.map(input => inputToPython(input, InputShape.Any)).join(", ")}`;

          // Warp-mode procedures execute all child procedures in warp mode as well
          if (warp) {
            blockSource = `martypy.warp(this.${procName})(${procArgs})`;
          } else {
            blockSource = `martypy.${procName}(${procArgs})`;
          }
          break;
        }

        case OpCode.argument_reporter_string_number:
        case OpCode.argument_reporter_boolean:
          // Argument reporters dragged outside their script return 0
          if (!script) {
            satisfiesInputShape = InputShape.Number;
            blockSource = `0`;
            break;
          }

          if (block.opcode === OpCode.argument_reporter_boolean) {
            satisfiesInputShape = InputShape.Boolean;
          } else {
            satisfiesInputShape = InputShape.Any;
          }
          blockSource = customBlockArgNameMap.get(script)[block.inputs.VALUE.value];
          break;

        case OpCode.pen_clear:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.clearPen()`;
          break;

        case OpCode.pen_stamp:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.stamp()`;
          break;

        case OpCode.pen_penDown:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.penDown = true`;
          break;

        case OpCode.pen_penUp:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.penDown = false`;
          break;

        case OpCode.pen_setPenColorToColor:
          satisfiesInputShape = InputShape.Stack;
          if (block.inputs.COLOR.type === "color") {
            const { r, g, b } = block.inputs.COLOR.value;
            blockSource = `martypy.penColor = Color.rgb(${r}, ${g}, ${b})`;
          } else {
            blockSource = `martypy.penColor = Color.num(${inputToPython(block.inputs.COLOR, InputShape.Number)})`;
          }
          break;

        case OpCode.pen_changePenColorParamBy:
          satisfiesInputShape = InputShape.Stack;
          switch (block.inputs.colorParam.value) {
            case "color":
              blockSource = increase(`martypy.penColor.h`, block.inputs.VALUE, false);
              break;
            case "saturation":
              blockSource = increase(`martypy.penColor.s`, block.inputs.VALUE, false);
              break;
            case "brightness":
              blockSource = increase(`martypy.penColor.v`, block.inputs.VALUE, false);
              break;
            case "transparency":
              blockSource = `martypy.penColor.a -= ((${inputToPython(block.inputs.VALUE, InputShape.Number)}) / 100)`;
              break;
          }
          break;

        case OpCode.pen_setPenColorParamTo:
          satisfiesInputShape = InputShape.Stack;
          switch (block.inputs.colorParam.value) {
            case "color":
              blockSource = `martypy.penColor.h = (${inputToPython(block.inputs.VALUE, InputShape.Number)})`;
              break;
            case "saturation":
              blockSource = `martypy.penColor.s = (${inputToPython(block.inputs.VALUE, InputShape.Number)})`;
              break;
            case "brightness":
              blockSource = `martypy.penColor.v = (${inputToPython(block.inputs.VALUE, InputShape.Number)})`;
              break;
            case "transparency":
              blockSource = `martypy.penColor.a = (1 - ((${inputToPython(block.inputs.VALUE, InputShape.Any)}) / 100))`;
              break;
          }
          break;

        case OpCode.pen_setPenSizeTo:
          satisfiesInputShape = InputShape.Stack;
          blockSource = `martypy.penSize = (${inputToPython(block.inputs.SIZE, InputShape.Number)})`;
          break;

        case OpCode.pen_changePenSizeBy:
          satisfiesInputShape = InputShape.Stack;
          blockSource = increase(`martypy.penSize`, block.inputs.SIZE, false);
          break;
        // **** MARTY BLOCKS ****
        // Motion
        case OpCode.mv2_dance:
          blockSource = `martypy.dance()`;
          break;
        case OpCode.mv2_getReady:
          blockSource = `martypy.get_ready()`;
          break;
        case OpCode.mv2_circle:
          const mv2_circle_side = ["left", "right"][inputToPython(block.inputs.SIDE, InputShape.Any)];
          const mv2_circle_moveTimeMs = inputToPython(block.inputs.MOVETIME, InputShape.Number) + " * 1000";
          blockSource = `martypy.circle_dance("${mv2_circle_side}", ${mv2_circle_moveTimeMs})`;
          break;
        case OpCode.mv2_eyes:
          const mv2_eyes = inputToPython(block.inputs.COMMAND, InputShape.Any);
          // pose must be one of {'angry', 'wide', 'excited', 'wiggle', 'normal'},
          const eyesMartyPyMap = {
            '"eyesExcited"': '"excited"',
            '"eyesWide"': '"wide"',
            '"eyesAngry"': '"angry"',
            '"wiggleEyes"': '"wiggle"',
            '"eyesNormal"': '"normal"',
          };
          blockSource = `martypy.eyes(${eyesMartyPyMap[mv2_eyes]})`;
          break;
        case OpCode.mv2_kick:
          const mv2_kick_side = ["left", "right"][inputToPython(block.inputs.SIDE, InputShape.Any)];
          blockSource = `martypy.kick("${mv2_kick_side}")`;
          break;
        case OpCode.mv2_hold:
          const mv2_hold_moveTimeMs = inputToPython(block.inputs.MOVETIME, InputShape.Number) + " * 1000";
          blockSource = `martypy.hold_position(${mv2_hold_moveTimeMs})`;
          break;
        case OpCode.mv2_lean:
          const mv2_lean_side = ["left", "right", "forward", "back"][inputToPython(block.inputs.SIDE, InputShape.Any)];
          const mv2_lean_moveTimeMs = inputToPython(block.inputs.MOVETIME, InputShape.Number) + " * 1000";
          blockSource = `martypy.lean(direction="${mv2_lean_side}", move_time=${mv2_lean_moveTimeMs})`;
          break;
        case OpCode.mv2_liftFoot:
          const mv2_lift_foot_side = ["left", "right"][inputToPython(block.inputs.SIDE, InputShape.Any)];
          blockSource = `martypy.lift_foot("${mv2_lift_foot_side}")`;
          break;
        case OpCode.mv2_lowerFoot:
          const mv2_lower_foot_side = ["left", "right"][inputToPython(block.inputs.SIDE, InputShape.Any)];
          blockSource = `martypy.lower_foot("${mv2_lower_foot_side}")`;
          break;
        case OpCode.mv2_moveJoint:
          const mv2_moveJoint_joint_id = ["left hip", "left twist", "left knee", "right hip", "right twist", "right knee", "left arm", "right arm", "eyes"][inputToPython(block.inputs.SERVOCHOICE, InputShape.Any)];
          const mv2_moveJoint_angle = inputToPython(block.inputs.ANGLE, InputShape.Number);
          const mv2_moveJoint_moveTimeMs = inputToPython(block.inputs.MOVETIME, InputShape.Number) + " * 1000";
          blockSource = `martypy.move_joint(joint_name_or_num="${mv2_moveJoint_joint_id}", position=${mv2_moveJoint_angle}, move_time=${mv2_moveJoint_moveTimeMs})`;
          break;
        case OpCode.mv2_slide:
          const mv2_slide_side = ["left", "right"][inputToPython(block.inputs.SIDE, InputShape.Any)];
          const mv2_slide_steps = inputToPython(block.inputs.STEPS, InputShape.Number);
          blockSource = `martypy.sidestep("${mv2_slide_side}", ${mv2_slide_steps})`;
          break;
        case OpCode.mv2_slideMsLength:
          const mv2_slideMsLength_steps = inputToPython(block.inputs.STEPS, InputShape.Number);
          const mv2_slideMsLength_side = ["left", "right"][inputToPython(block.inputs.SIDE, InputShape.Any)];
          const mv2_slideMsLength_moveTimeMs = inputToPython(block.inputs.MOVETIME, InputShape.Number) + " * 1000";
          const mv2_slideMsLength_length = inputToPython(block.inputs.STEPLEN, InputShape.Number);
          blockSource = `martypy.sidestep("${mv2_slideMsLength_side}", ${mv2_slideMsLength_steps}, ${mv2_slideMsLength_length}, ${mv2_slideMsLength_moveTimeMs})`;
          break;
        case OpCode.mv2_standStraight:
          const mv2_standStraight_moveTimeMs = inputToPython(block.inputs.MOVETIME, InputShape.Number) + " * 1000";
          blockSource = `martypy.stand_straight(${mv2_standStraight_moveTimeMs})`;
          break;
        case OpCode.mv2_turn:
          const mv2_turn_steps = inputToPython(block.inputs.STEPS, InputShape.Number);
          const mv2_turn_side = inputToPython(block.inputs.SIDE, InputShape.Any);
          let mv2_turn_angle = 20;
          if (mv2_turn_side === "1") {
            mv2_turn_angle = -20;
          }
          blockSource = `martypy.walk(num_steps=${mv2_turn_steps}, turn=${mv2_turn_angle})`;
          break;
        case OpCode.mv2_walk_fw:
          const mv2_walk_fw_steps = inputToPython(block.inputs.STEPS, InputShape.Number);
          blockSource = `martypy.walk(num_steps=${mv2_walk_fw_steps}, turn=0, step_length=25)`;
          break;
        case OpCode.mv2_walk_bw:
          const mv2_walk_bw_steps = inputToPython(block.inputs.STEPS, InputShape.Number);
          blockSource = `martypy.walk(num_steps=${mv2_walk_bw_steps}, turn=0, step_length=-25)`;
          break;
        case OpCode.mv2_walk:
          const mv2_walk_steps = inputToPython(block.inputs.STEPS, InputShape.Number);
          const mv2_walk_length = inputToPython(block.inputs.STEPLEN, InputShape.Number);
          const mv2_walk_moveTimeMs = inputToPython(block.inputs.MOVETIME, InputShape.Number) + " * 1000";
          const mv2_walk_angle = inputToPython(block.inputs.TURN, InputShape.Number);
          let turn = parseInt(mv2_walk_angle);
          turn = Math.min(Math.max(turn, -25), 25);
          blockSource = `martypy.walk(num_steps=${mv2_walk_steps}, turn=${turn}, step_length=${mv2_walk_length}, move_time=${mv2_walk_moveTimeMs})`;
          break;
        case OpCode.mv2_wave:
          const mv2_wave_side = ["left", "right"][inputToPython(block.inputs.SIDE, InputShape.Any)];
          blockSource = `martypy.wave("${mv2_wave_side}")`;
          break;
        case OpCode.mv2_gripperArmBasic:
          const mv2_gripperArmBasic_hand_position = ["open", "close"][
            inputToPython(block.inputs.HAND_POSITION, InputShape.Any)
          ];
          blockSource = `martypy.gripper("${mv2_gripperArmBasic_hand_position}") # not implemented in python`;
          break;
        case OpCode.mv2_gripperArmTimed:
          const mv2_gripperArmTimed_hand_position = ["open", "close"][
            inputToPython(block.inputs.HAND_POSITION, InputShape.Any)
          ];
          const mv2_gripperArmTimed_moveTimeMs = inputToPython(block.inputs.MOVETIME, InputShape.Number) + " * 1000";
          blockSource = `martypy.gripper("${mv2_gripperArmTimed_hand_position}", ${mv2_gripperArmTimed_moveTimeMs}) # not implemented in python`;
          break;
        case OpCode.mv2_wiggle:
          blockSource = `martypy.wiggle()`;
          break;
        // Looks
        case OpCode.mv2_discoChangeBlockPattern:
          const mv2_discoChangeBlockPattern_pattern = inputToPython(block.inputs.PATTERN, InputShape.Any);
          const mv2_discoChangeBlockPattern_board = inputToPython(block.inputs.BOARDTYPE, InputShape.Any);
          blockSource = `martypy.disco_named_pattern(add_on=${mv2_discoChangeBlockPattern_board}, pattern=${mv2_discoChangeBlockPattern_pattern})`;
          break;
        case OpCode.mv2_LEDEyesColour:
          const mv2_LEDEyesColour_board = inputToPython(block.inputs.BOARDTYPE, InputShape.Any);
          const mv2_LEDEyesColour_colour = inputToPython(block.inputs.COLOUR_LED_EYES, InputShape.Any);
          const mv2_LEDEyesColour_colour_final = objToRGBTupleHelper(mv2_LEDEyesColour_colour);
          blockSource = `martypy.disco_color(color=${mv2_LEDEyesColour_colour_final}, add_on=${mv2_LEDEyesColour_board}, api='led')`;
          break;
        case OpCode.mv2_LEDEyesColour_SpecificLED:
          const mv2_LEDEyesColour_SpecificLED_board = inputToPython(block.inputs.BOARDTYPE, InputShape.Any);
          const mv2_LEDEyesColour_SpecificLED_led_position = inputToPython(block.inputs.LED_POSITION, InputShape.Any);
          const mv2_LEDEyesColour_SpecificLED_colour = inputToPython(block.inputs.COLOUR_LED_EYES, InputShape.Any);
          const mv2_LEDEyesColour_SpecificLED_colour_final = objToRGBTupleHelper(mv2_LEDEyesColour_SpecificLED_colour)
          blockSource = `martypy.disco_color_specific_led(color=${mv2_LEDEyesColour_SpecificLED_colour_final}, add_on=${mv2_LEDEyesColour_SpecificLED_board}, led_id=${mv2_LEDEyesColour_SpecificLED_led_position})`;
          break;
        case OpCode.mv2_LEDEyesColourLEDs:
          const mv2_LEDEyesColourLEDs_colour = inputToPython(block.inputs.COLOUR, InputShape.Any);
          const mv2_LEDEyesColourLEDs_board = inputToPython(block.inputs.SIDE, InputShape.Any);
          let mv2_LEDEyesColourLEDs_colour_corrected;
          try {
            const parsedColours = JSON.parse(mv2_LEDEyesColourLEDs_colour);
            mv2_LEDEyesColourLEDs_colour_corrected = parsedColours.map((c: string) => {
              if (c === "#5ba591") return "#000000";
              return c;
            })
            mv2_LEDEyesColourLEDs_colour_corrected = JSON.stringify(mv2_LEDEyesColourLEDs_colour_corrected);
          } catch {
            mv2_LEDEyesColourLEDs_colour_corrected = mv2_LEDEyesColourLEDs_colour === "#5ba591" ? '"#000000"' : mv2_LEDEyesColourLEDs_colour;
          }
          blockSource = `martypy.disco_color_eyepicker(colours=${mv2_LEDEyesColourLEDs_colour_corrected}, add_on=${mv2_LEDEyesColourLEDs_board})`;
          break;
        case OpCode.mv2_RGBOperator:
          const mv2_RGBOperator_NUM_R = inputToPython(block.inputs.NUM_R, InputShape.Any);
          const mv2_RGBOperator_NUM_B = inputToPython(block.inputs.NUM_B, InputShape.Any);
          const mv2_RGBOperator_NUM_G = inputToPython(block.inputs.NUM_G, InputShape.Any);
          blockSource = `martypy.rgb_operator(${mv2_RGBOperator_NUM_R}, ${mv2_RGBOperator_NUM_B}, ${mv2_RGBOperator_NUM_G})`;
          break;
        case OpCode.mv2_HSLOperator:
          const mv2_HSLOperator_NUM_H = inputToPython(block.inputs.NUM_H, InputShape.Any);
          const mv2_HSLOperator_NUM_S = inputToPython(block.inputs.NUM_S, InputShape.Any);
          const mv2_HSLOperator_NUM_L = inputToPython(block.inputs.NUM_L, InputShape.Any);
          blockSource = `martypy.hsv_operator(${mv2_HSLOperator_NUM_H}, ${mv2_HSLOperator_NUM_S}, ${mv2_HSLOperator_NUM_L})`;
          break;
        case OpCode.mv2_discoChangeBackColour:
          const mv2_discoChangeBackColour_colour = inputToPython(block.inputs.COLOR, InputShape.Any);
          const mv2_discoChangeBackColour_colour_final = objToRGBTupleHelper(mv2_discoChangeBackColour_colour);
          blockSource = `martypy.function_led(colour=${mv2_discoChangeBackColour_colour_final}, breathe="on")`;
          break;
        case OpCode.mv2_discoSetBreatheBackColour:
          const mv2_discoSetBreatheBackColour_colour = inputToPython(block.inputs.COLOR, InputShape.Any);
          const mv2_discoSetBreatheBackColour_time_ms = inputToPython(block.inputs.MILLISECONDS, InputShape.Any);
          const mv2_discoSetBreatheBackColour_colour_final = objToRGBTupleHelper(mv2_discoSetBreatheBackColour_colour);
          blockSource = `martypy.function_led(colour=${mv2_discoSetBreatheBackColour_colour_final}, breathe="breathe", breath_ms=${mv2_discoSetBreatheBackColour_time_ms})`;
          break;
        case OpCode.mv2_discoTurnOffBackColour:
          blockSource = `martypy.function_led_off()`;
          break;
        case OpCode.mv2_discoChangeRegionColour:
          const mv2_discoChangeRegionColour_colour = inputToPython(block.inputs.COLOR, InputShape.Any);
          const mv2_discoChangeRegionColour_board = inputToPython(block.inputs.BOARDTYPE, InputShape.Any);
          const mv2_discoChangeRegionColour_region = inputToPython(block.inputs.REGION, InputShape.Any);
          const mv2_discoChangeRegionColour_colour_final = objToRGBTupleHelper(mv2_discoChangeRegionColour_colour);
          blockSource = `martypy.disco_color(region=${mv2_discoChangeRegionColour_region}, add_on=${mv2_discoChangeRegionColour_board}, color=${mv2_discoChangeRegionColour_colour_final}, api='led')`;
          break;
        // Sound
        case OpCode.mv2_playSoundUntilDone:
          const mv2_playSoundUntilDone_sound = inputToPython(block.inputs.SOUND_MENU, InputShape.Any);
          blockSource = `martypy.play_sound_until_done(${mv2_playSoundUntilDone_sound}) # not implemented in python`;
          break;
        case OpCode.mv2_playNote:
          const mv2_playNote_note = inputToPython(block.inputs.NOTES_MENU, InputShape.Any);
          blockSource = `martypy.play_note(${mv2_playNote_note}) # not implemented in python`;
          break;
        case OpCode.mv2_playTone:
          const mv2_playTone_hz1 = inputToPython(block.inputs.HZ1, InputShape.Any);
          const mv2_playTone_hz2 = inputToPython(block.inputs.HZ2, InputShape.Any);
          const mv2_playTone_seconds = inputToPython(block.inputs.SECONDS, InputShape.Any);
          blockSource = `martypy.play_tone(${mv2_playTone_hz1},${mv2_playTone_hz2}, ${mv2_playTone_seconds}) # not implemented in python`;
          break;
        case OpCode.mv2_stopSounds:
          blockSource = `martypy.stop_sound() # not implemented in python`;
          break;
        case OpCode.mv2_playSound:
          const mv2_playSound_sound = inputToPython(block.inputs.SOUND_MENU, InputShape.Any);
          blockSource = `martypy.play_sound(${mv2_playSound_sound}) # not implemented in python`;
          break;
        case OpCode.mv2_changePitchEffect:
          const mv2_changePitchEffect_pitch = inputToPython(block.inputs.VALUE, InputShape.Any);
          blockSource = `martypy.change_pitch_effect(${mv2_changePitchEffect_pitch}) # not implemented in python`;
          break;
        case OpCode.mv2_setPitchEffect:
          const mv2_setPitchEffect_pitch = inputToPython(block.inputs.VALUE, InputShape.Any);
          blockSource = `martypy.set_pitch_effect(${mv2_setPitchEffect_pitch}) # not implemented in python`;
          break;
        case OpCode.mv2_clearSoundEffects:
          blockSource = `martypy.clear_sound_effects() # not implemented in python`;
          break;
        case OpCode.mv2_changeVolume:
          const mv2_changeVolume_volume = inputToPython(block.inputs.VOLUME, InputShape.Any);
          blockSource = `martypy.change_volume(${mv2_changeVolume_volume}) # not implemented in python`;
          break;
        case OpCode.mv2_setVolume:
          const mv2_setVolume_volume = inputToPython(block.inputs.VOLUME, InputShape.Any);
          blockSource = `martypy.set_volume(${mv2_setVolume_volume}) # not implemented in python`;
          break;
        // Sensing
        case OpCode.XAxisMovement:
          blockSource = `martypy.get_accelerometer(True, 0)`;
          break;
        case OpCode.YAxisMovement:
          blockSource = `martypy.get_accelerometer(True, 1)`;
          break;
        case OpCode.ZAxisMovement:
          blockSource = `martypy.get_accelerometer(True, 2)`;
          break;
        case OpCode.BatteryPercentage:
          blockSource = "martypy.get_battery_remaining()";
          break;
        case OpCode.ServoCurrent:
          const mv2_ServoCurrent_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.get_joint_current(${mv2_ServoCurrent_servo_choice})`;
          break;
        case OpCode.ServoPosition:
          const mv2_ServoPosition_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.get_joint_position(${mv2_ServoPosition_servo_choice})`;
          break;
        case OpCode.mv2_obstaclesense:
          const mv2_obstaclesense_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.foot_obstacle_sensed(${mv2_obstaclesense_servo_choice})`;
          break;
        case OpCode.mv2_groundsense:
          const mv2_groundsense_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.foot_on_ground(${mv2_groundsense_servo_choice})`;
          break;
        case OpCode.mv2_coloursense:
          const mv2_coloursense_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.get_colour_sensor(${mv2_coloursense_servo_choice}) # not implemented in python`;
          break;
        case OpCode.mv2_coloursense_hex:
          const mv2_coloursense_hex_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.get_colour_sensor_hex(${mv2_coloursense_hex_servo_choice}) # not implemented in python`;
          break;
        case OpCode.mv2_coloursenseraw:
          const mv2_coloursenseraw_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.get_colour_sensor_raw(${mv2_coloursenseraw_servo_choice}) # not implemented in python`;
          break;
        case OpCode.mv2_distancesense:
          const mv2_distancesense_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.get_distance_sensor(${mv2_distancesense_servo_choice})`;
          break;
        case OpCode.mv2_lightsense:
          const mv2_lightsense_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.get_light_sensor(${mv2_lightsense_servo_choice}) # not implemented in python`;
          break;
        case OpCode.mv2_noisesense:
          const mv2_noisesense_servo_choice = inputToPython(block.inputs.SERVOCHOICE, InputShape.Any);
          blockSource = `martypy.get_noise_sensor(${mv2_noisesense_servo_choice}) # not implemented in python`;
          break;
        // Speak
        case OpCode.text2speech_marty_speakAndWait:
          const mv2_speak_text = inputToPython(block.inputs.WORDS, InputShape.Any);
          blockSource = `martypy.speak(${mv2_speak_text}) # not implemented in python`;
          break;
        default:
          satisfiesInputShape = InputShape.Any;
          blockSource = `# TODO: Implement ${block.opcode}`;
          break;
      }

      if (satisfiesInputShape === desiredInputShape) {
        return blockSource;
      }

      if (desiredInputShape === "boolean") {
        return `${blockSource}`;
      }

      if (desiredInputShape === "string") {
        return `${blockSource}`;
      }

      if (desiredInputShape === "number") {
        return `${blockSource}`;
      }

      if (desiredInputShape === "index") {
        return `((${blockSource}) - 1)`;
      }

      return blockSource;
    }
  }

  const getPathsToRelativeOrAbsolute = destination => {
    const fakeOrigin = "http://" + Math.random() + ".com";
    const isExternal = new URL(destination, fakeOrigin).origin !== fakeOrigin;
    const isAbsolute = isExternal || destination.startsWith("/");

    if (isAbsolute) {
      return () => destination;
    } else {
      return ({ from }) => {
        switch (from) {
          case "index":
            return "./" + destination;
          case "target":
            return "../" + destination;
        }
      };
    }
  };

  const toPythonJS = getPathsToRelativeOrAbsolute(options.leopardJSURL);
  const toPythonCSS = getPathsToRelativeOrAbsolute(options.leopardCSSURL);

  let files: { [fileName: string]: string } = {};

  // Scratch doesn't care much about "types" (like numbers vs strings), but
  // sometimes Python does. This function attempts to parse a Scratch
  // value and turn it into the most appropriate Python representation
  function toOptimalPythonRepresentation(value): string {
    if (Array.isArray(value)) {
      return `[${value.map(toOptimalPythonRepresentation).join(", ")}]`;
    }

    if (typeof value === "string") {
      // Does this string look like a number?
      const numValue = Number(value);

      if (isNaN(numValue)) {
        // Not a number! Treat it like a string!
        return JSON.stringify(value);
      }

      if (Number.isInteger(numValue) && !Number.isSafeInteger(numValue)) {
        // If this number is an integer that is so large it cannot be reliably
        // stored, leave it as a string instead. (Usually in these cases the
        // Scratch user is treating the number like a string anyway.)
        return JSON.stringify(value);
      }

      // This looks like a nice, safe number
      return JSON.stringify(numValue);
    }

    // Here's the catch-all for something else that might pass through
    return JSON.stringify(value);
  }

  for (const target of [project.stage, ...project.sprites]) {
    // We don't want to include Python for unused variable watchers.
    // Some watchers start invisible but appear later, so this code builds a list of
    // watchers that appear in "show variable" and "show list" blocks. The list is
    // actually *used* later, by some other code.
    let shownWatchers: Set<string> = new Set();
    let targetsToCheckForShowBlocks: Target[];
    if (target.isStage) {
      targetsToCheckForShowBlocks = [project.stage, ...project.sprites];
    } else {
      targetsToCheckForShowBlocks = [target];
    }
    for (const checkTarget of targetsToCheckForShowBlocks) {
      for (const block of checkTarget.blocks) {
        if (block.opcode === OpCode.data_showvariable || block.opcode === OpCode.data_hidevariable) {
          shownWatchers.add(block.inputs.VARIABLE.value.id);
        }
        if (block.opcode === OpCode.data_showlist || block.opcode === OpCode.data_hidelist) {
          shownWatchers.add(block.inputs.LIST.value.id);
        }
      }
    }
    files[`${target.name}/${target.name}.py`] = `${arrangeScriptsBasedOnVerticalAlignment(target.scripts)
      // .filter(script => script.hat !== null)
      .map(script => scriptToPython(script, target))
      .map(stringifiedScript => formatPythonIndentation(stringifiedScript))
      .join("")}
          `;
  }

  Object.keys(files).forEach(filepath => {
    // files[filepath] = prettier.format(files[filepath], { ...prettierConfig, filepath });
  });

  // concatenate all the files together
  let fileContents = "";
  for (const filepath of Object.keys(files).sort()) {
    const fileTitle = filepath.split("/")[0];
    fileContents += `######## ${fileTitle} ########\n`;
    fileContents += files[filepath] + "\n########\n\n";
  }
  return fileContents;
}

/**
 * This function takes in an array of scripts
 * rearranges them based on vertical alignment
 * and returns them
 * @param {Script[]} scripts
 * @returns {Script[]} Arranged scripts based on vertical alignment
 */
function arrangeScriptsBasedOnVerticalAlignment(scripts: Script[]): Script[] {
  const newScripts: Script[] = scripts.slice();
  // Sort the vertically aligned scripts based on their y position
  newScripts.sort((a, b) => a.y - b.y);

  // Return the vertically aligned scripts followed by the non vertically aligned scripts
  return newScripts;
}


/**
 * This function takes in a python script and formats its indentation
 * @param script 
 * @returns {script} formatted script
 */
function formatPythonIndentation(script: string) {
  // Split the script into lines
  const lines = script.split('\n');

  // Initialize variables to hold the formatted code and current indentation level
  let formattedCode = '';
  let indentationLevel = 0;
  let lastIndentation = 0;

  // Loop through each line to format it
  lines.forEach(line => {
    // Remove leading and trailing whitespace
    let trimmedLine = line.trim();

    // Count leading spaces to determine the current line's intended indentation level
    const currentIndentation = line.search(/\S|$/);

    // Check if the indentation level should decrease
    if (trimmedLine.includes(INDENTATION_RESET_CODE)) {
      const levelsToGoBack = 1;
      indentationLevel = Math.max(indentationLevel - levelsToGoBack, 0);
      trimmedLine = "";
    }

    // Update lastIndentation for the next iteration
    lastIndentation = currentIndentation;

    if (trimmedLine.startsWith('#') || trimmedLine === '') {
      formattedCode += ' '.repeat(indentationLevel * 4) + trimmedLine + '\n';
      return;
    }

    if (trimmedLine.endsWith(':')) {
      formattedCode += ' '.repeat(indentationLevel * 4) + trimmedLine + '\n';
      indentationLevel++;
      return;
    }

    // if it's an empty line, don't include it
    if (trimmedLine === '') {
      return;
    }
    formattedCode += ' '.repeat(indentationLevel * 4) + trimmedLine + '\n';
  });

  return formattedCode;
}

function objToRGBTupleHelper(colour: string) {
  let final = colour;
  try {
    const parsed = JSON.parse(colour);
    final = `(${parsed.r}, ${parsed.g}, ${parsed.b})`;
  } catch {
    final = colour;
  }
  return final;
}