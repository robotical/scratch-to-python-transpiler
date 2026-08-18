import { spawnSync } from "child_process";

import Block, { BlockBase } from "../../Block";
import * as BlockInput from "../../BlockInput";
import { OpCode } from "../../OpCode";
import Project from "../../Project";
import Script from "../../Script";
import { Stage } from "../../Target";
import { Variable } from "../../Data";
import martyBlockToPython, { MartyPythonInputShape } from "./martyBlocks";

const numberInput = (value: number | string): BlockInput.Number => ({ type: "number", value });
const stringInput = (value: string): BlockInput.String => ({ type: "string", value });

const commonInputs: { [name: string]: BlockInput.Any } = {
  STEPS: numberInput(2),
  STEPLEN: numberInput(25),
  MOVETIME: numberInput(1.5),
  TURN: numberInput(10),
  SIDE: stringInput("1"),
  DIRECTION: stringInput("-20"),
  COMMAND: stringInput("eyesExcited"),
  SERVOCHOICE: stringInput("0"),
  ANGLE: numberInput(15),
  STOP_TYPE: stringInput("stop"),
  HAND_POSITION: stringInput("1"),
  BOARDTYPE: stringInput(JSON.stringify({ name: "LEDeye", whoAmI: "LEDeye" })),
  PATTERN: stringInput("pinwheel"),
  COLOUR_LED_EYES: { type: "color", value: { r: 12, g: 34, b: 56 } },
  COLOUR: stringInput(JSON.stringify(["#ff0000", "#9966FF"])),
  LED_POSITION: numberInput(4),
  COLOR: { type: "color", value: { r: 1, g: 2, b: 3 } },
  MILLISECONDS: numberInput(750),
  REGION: stringInput("2"),
  NUM_R: numberInput(10),
  NUM_G: numberInput(20),
  NUM_B: numberInput(30),
  NUM_H: numberInput(180),
  NUM_S: numberInput(50),
  NUM_L: numberInput(25),
  FREQUENCY: numberInput(440),
  SOUND_MENU: stringInput("meow"),
  NOTES_MENU: stringInput(JSON.stringify({ name: "A Piano" })),
  HZ1: numberInput(220),
  HZ2: numberInput(440),
  SECONDS: numberInput(1),
  VALUE: numberInput(10),
  VOLUME: numberInput(80),
  SENSORCHOICE: stringInput("LeftColorSensor"),
  SENSORCHANNEL: stringInput("Red"),
  WORDS: stringInput("hello")
};

const martyOpcodes: OpCode[] = [
  OpCode.mv2_getReady,
  OpCode.mv2_walk_fw,
  OpCode.mv2_walk_bw,
  OpCode.mv2_walk,
  OpCode.mv2_turn,
  OpCode.mv2_wiggle,
  OpCode.mv2_circle,
  OpCode.mv2_kick,
  OpCode.mv2_lean,
  OpCode.mv2_slide,
  OpCode.mv2_slideMsLength,
  OpCode.mv2_eyes,
  OpCode.mv2_moveLeg,
  OpCode.mv2_liftFoot,
  OpCode.mv2_lowerFoot,
  OpCode.mv2_moveJoint,
  OpCode.mv2_wave,
  OpCode.mv2_stop,
  OpCode.mv2_pause,
  OpCode.mv2_resume,
  OpCode.mv2_dance,
  OpCode.mv2_standStraight,
  OpCode.mv2_hold,
  OpCode.mv2_gripperArmBasic,
  OpCode.mv2_gripperArmTimed,
  OpCode.mv2_discoChangeBlockPattern,
  OpCode.mv2_LEDEyesColour,
  OpCode.mv2_LEDEyesColour_SpecificLED,
  OpCode.colour_picker_LED_eyes,
  OpCode.mv2_LEDEyesColourLEDs,
  OpCode.mv2_turnAllLEDsOff,
  OpCode.mv2_discoChangeBackColour,
  OpCode.mv2_discoSetBreatheBackColour,
  OpCode.mv2_discoTurnOffBackColour,
  OpCode.mv2_discoChangeRegionColour,
  OpCode.mv2_RGBOperator,
  OpCode.mv2_HSLOperator,
  OpCode.nearest_note,
  OpCode.mv2_playSound,
  OpCode.mv2_playSoundUntilDone,
  OpCode.mv2_playNote,
  OpCode.mv2_playTone,
  OpCode.mv2_stopSounds,
  OpCode.mv2_changePitchEffect,
  OpCode.mv2_setPitchEffect,
  OpCode.mv2_clearSoundEffects,
  OpCode.mv2_changeVolume,
  OpCode.mv2_setVolume,
  OpCode.XAxisMovement,
  OpCode.YAxisMovement,
  OpCode.ZAxisMovement,
  OpCode.XAxisMagnetometer,
  OpCode.YAxisMagnetometer,
  OpCode.ZAxisMagnetometer,
  OpCode.BatteryPercentage,
  OpCode.ServoCurrent,
  OpCode.ServoPosition,
  OpCode.mv2_obstaclesense,
  OpCode.mv2_groundsense,
  OpCode.mv2_coloursense,
  OpCode.mv2_coloursense_hex,
  OpCode.mv2_coloursenseraw,
  OpCode.mv2_distancesense,
  OpCode.mv2_lightsense,
  OpCode.mv2_noisesense,
  OpCode.mv2_onObjectSense,
  OpCode.mv2_onLightSense,
  OpCode.mv2_onNoiseSense,
  OpCode.mv2_onColourSense,
  OpCode.text2speech_marty_speakAndWait
];

const createBlock = (opcode: OpCode): Block => new BlockBase({
  opcode,
  inputs: { ...commonInputs }
}) as Block;

const inputToPython = (input: BlockInput.Any, shape: MartyPythonInputShape): string => {
  if (!input) return "None";
  if (input.type === "block") return "dynamic_value";
  if (input.type === "color") return JSON.stringify(input.value);
  if (shape === "number") return String(input.value);
  return JSON.stringify(input.value);
};

describe("Marty Python generation", () => {
  test.each(martyOpcodes)("translates %s", opcode => {
    expect(martyBlockToPython(createBlock(opcode), inputToPython)).not.toBeNull();
  });

  test("uses correct RGB order and quotes servo names", () => {
    expect(martyBlockToPython(createBlock(OpCode.mv2_RGBOperator), inputToPython))
      .toBe("my_marty.rgb_operator(10, 20, 30)");
    expect(martyBlockToPython(createBlock(OpCode.ServoCurrent), inputToPython))
      .toBe('my_marty.get_joint_current("left hip")');
  });

  test("preserves runtime expressions instead of evaluating them during translation", () => {
    const walk = createBlock(OpCode.mv2_walk);
    (walk.inputs as { [name: string]: BlockInput.Any }).TURN = {
      type: "block",
      value: createBlock(OpCode.BatteryPercentage)
    };
    const generated = martyBlockToPython(walk, inputToPython);
    expect(generated).toContain("int(dynamic_value)");
    expect(generated).not.toContain("NaN");
  });

  test("extracts dynamic board data and maps colour-picker off pixels", () => {
    expect(martyBlockToPython(createBlock(OpCode.mv2_LEDEyesColour), inputToPython))
      .toContain('add_on="LEDeye"');
    expect(martyBlockToPython(createBlock(OpCode.colour_picker_LED_eyes), inputToPython))
      .toBe('["#ff0000","#000000"]');
  });

  test("a project containing every Marty command produces syntactically valid Python 3", async () => {
    const stage = new Stage({
      name: "Marty",
      scripts: [new Script({ blocks: martyOpcodes.map(createBlock) })]
    });
    const project = new Project({ stage });
    const source = await project.toPython();
    const parsed = spawnSync("python3", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], {
      input: source,
      encoding: "utf8"
    });
    expect(parsed.stderr).toBe("");
    expect(parsed.status).toBe(0);
  });

  test("nested control blocks around Marty commands produce runnable Python", async () => {
    const repeat = new BlockBase({
      opcode: OpCode.control_repeat,
      inputs: {
        TIMES: numberInput(2),
        SUBSTACK: {
          type: "blocks",
          value: [createBlock(OpCode.mv2_getReady), createBlock(OpCode.mv2_walk_fw)]
        }
      }
    }) as Block;
    const wait = new BlockBase({
      opcode: OpCode.control_wait,
      inputs: { DURATION: numberInput(0.1) }
    }) as Block;
    const project = new Project({
      stage: new Stage({name: "Marty", scripts: [new Script({blocks: [repeat, wait]})]})
    });
    const source = await project.toPython();
    const parsed = spawnSync("python3", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], {
      input: source,
      encoding: "utf8"
    });

    expect(source.match(/^my_marty = martypy\.Marty\(/gm)).toHaveLength(1);
    expect(source).toContain("import time");
    expect(source).toContain("for i in range(2):");
    expect(source).toContain("time.sleep(0.1)");
    expect(parsed.stderr).toBe("");
    expect(parsed.status).toBe(0);
  });

  test("Marty sensor hats become one edge-triggered event loop", async () => {
    const eventScript = (hatOpcode: OpCode, inputs: { [name: string]: BlockInput.Any }) => new Script({
      blocks: [new BlockBase({opcode: hatOpcode, inputs}) as Block, createBlock(OpCode.mv2_getReady)]
    });
    const project = new Project({
      stage: new Stage({
        name: "Marty",
        scripts: [
          eventScript(OpCode.mv2_onObjectSense, {SENSORCHOICE: stringInput("LeftIRFoot")}),
          eventScript(OpCode.mv2_onColourSense, {COLOUR: stringInput("red")})
        ]
      })
    });
    const source = await project.toPython();
    const parsed = spawnSync("python3", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], {
      input: source,
      encoding: "utf8"
    });

    expect(source.match(/^while True:/gm)).toHaveLength(1);
    expect(source).toContain('bool(my_marty.object_sensed("LeftIRFoot"))');
    expect(source).toContain('bool(my_marty.colour_sensed("red"))');
    expect(source.match(/my_marty\.get_ready\(\)/g)).toHaveLength(2);
    expect(source).toContain("time.sleep(0.05)");
    expect(parsed.stderr).toBe("");
    expect(parsed.status).toBe(0);
  });

  test("declares a Scratch variable before Marty blocks reference it", async () => {
    const variable = new Variable({id: "my-variable-id", name: "my variable", value: 7});
    const variableInput: BlockInput.Variable = {
      type: "variable",
      value: {id: variable.id, name: variable.name}
    };
    const reporter = new BlockBase({
      opcode: OpCode.data_variable,
      inputs: {VARIABLE: variableInput}
    }) as Block;
    const setVariable = new BlockBase({
      opcode: OpCode.data_setvariableto,
      inputs: {VARIABLE: variableInput, VALUE: stringInput("3")}
    }) as Block;
    const walk = createBlock(OpCode.mv2_walk_fw);
    (walk.inputs as { [name: string]: BlockInput.Any }).STEPS = {type: "block", value: reporter};
    const project = new Project({
      stage: new Stage({
        name: "Marty",
        variables: [variable],
        scripts: [new Script({blocks: [setVariable, walk]})]
      })
    });
    const source = await project.toPython();
    const declarationIndex = source.indexOf("myVariable = 7");
    const referenceIndex = source.indexOf("my_marty.walk(num_steps=myVariable");

    expect(declarationIndex).toBeGreaterThan(-1);
    expect(referenceIndex).toBeGreaterThan(declarationIndex);
    expect(source).toContain("myVariable = (3)");
  });

  test("translates My Blocks to Python functions with arguments and global Scratch data", async () => {
    const variable = new Variable({id: "counter-id", name: "counter", value: 0});
    const variableInput: BlockInput.Variable = {
      type: "variable",
      value: {id: variable.id, name: variable.name}
    };
    const argumentReporter = new BlockBase({
      opcode: OpCode.argument_reporter_string_number,
      inputs: {VALUE: stringInput("counter")}
    }) as Block;
    const walk = createBlock(OpCode.mv2_walk_fw);
    (walk.inputs as { [name: string]: BlockInput.Any }).STEPS = {type: "block", value: argumentReporter};
    const changeCounter = new BlockBase({
      opcode: OpCode.data_changevariableby,
      inputs: {VARIABLE: variableInput, VALUE: numberInput(1)}
    }) as Block;
    const definition = new BlockBase({
      opcode: OpCode.procedures_definition,
      inputs: {
        PROCCODE: stringInput("walk %n steps"),
        ARGUMENTS: {
          type: "customBlockArguments",
          value: [
            {type: "label", name: "walk"},
            {type: "numberOrString", name: "counter", defaultValue: 2},
            {type: "label", name: "steps"}
          ]
        },
        WARP: {type: "boolean", value: false}
      }
    }) as Block;
    const call = new BlockBase({
      opcode: OpCode.procedures_call,
      inputs: {
        PROCCODE: stringInput("walk %n steps"),
        INPUTS: {type: "customBlockInputValues", value: [numberInput(4)]}
      }
    }) as Block;
    const project = new Project({
      stage: new Stage({
        name: "Marty",
        variables: [variable],
        // Deliberately put the call first; Python still requires the function
        // definition to be emitted before this top-level invocation.
        scripts: [
          new Script({name: "call walk", blocks: [call], y: 0}),
          new Script({name: "walk steps", blocks: [definition, changeCounter, walk], y: 100})
        ]
      })
    });
    const source = await project.toPython();
    const parsed = spawnSync("python3", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], {
      input: source,
      encoding: "utf8"
    });
    const definitionIndex = source.indexOf("def walkSteps(counter2):");
    const callIndex = source.indexOf("walkSteps(4)");

    expect(definitionIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(definitionIndex);
    expect(source).toContain("global counter");
    expect(source).toContain("counter += 1");
    expect(source).toContain("my_marty.walk(num_steps=counter2");
    expect(source).not.toContain("my_marty.walkSteps");
    expect(parsed.stderr).toBe("");
    expect(parsed.status).toBe(0);
  });
});
