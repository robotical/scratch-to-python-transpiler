import Block from "../../Block";
import * as BlockInput from "../../BlockInput";
import { OpCode } from "../../OpCode";

export type MartyPythonInputShape = "any" | "number" | "string";
export type MartyInputToPython = (input: BlockInput.Any, shape: MartyPythonInputShape) => string;

const SIDE_NAMES = ["left", "right"];
const DIRECTION_NAMES = ["left", "right", "forward", "back"];
const JOINT_NAMES = [
  "left hip",
  "left twist",
  "left knee",
  "right hip",
  "right twist",
  "right knee",
  "left arm",
  "right arm",
  "eyes"
];
const EYE_POSES = {
  eyesExcited: "excited",
  eyesWide: "wide",
  eyesAngry: "angry",
  wiggleEyes: "wiggle",
  eyesNormal: "normal"
};

const pythonString = (value: unknown): string => JSON.stringify(String(value));

const staticValue = (input: BlockInput.Any): any => {
  if (!input || input.type === "block" || input.type === "blocks") return undefined;
  return input.value;
};

const mappedStaticString = (
  input: BlockInput.Any,
  values: string[] | { [value: string]: string },
  inputToPython: MartyInputToPython
): string => {
  const value = staticValue(input);
  if (value !== undefined) {
    const mapped = Array.isArray(values) ? values[Number(value)] : values[String(value)];
    return pythonString(mapped === undefined ? value : mapped);
  }
  return inputToPython(input, "string");
};

const parseNestedJSON = (value: any): any => {
  let parsed = value;
  for (let attempts = 0; attempts < 2 && typeof parsed === "string"; attempts++) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      break;
    }
  }
  return parsed;
};

const boardAttribute = (input: BlockInput.Any, attribute: "name" | "whoAmI", inputToPython: MartyInputToPython) => {
  const value = staticValue(input);
  if (value !== undefined) {
    const parsed = parseNestedJSON(value);
    if (parsed && typeof parsed === "object" && parsed[attribute]) return pythonString(parsed[attribute]);
    return pythonString(parsed);
  }
  return inputToPython(input, "string");
};

const colourToPython = (input: BlockInput.Any, inputToPython: MartyInputToPython): string => {
  if (input && input.type === "color") {
    const { r, g, b } = input.value;
    return `(${r}, ${g}, ${b})`;
  }
  return inputToPython(input, "any");
};

const eyePickerToPython = (input: BlockInput.Any, inputToPython: MartyInputToPython): string => {
  const value = staticValue(input);
  if (value === undefined) return inputToPython(input, "any");
  const parsed = parseNestedJSON(value);
  if (!Array.isArray(parsed)) return pythonString(parsed === "#5ba591" ? "#000000" : parsed);
  return JSON.stringify(parsed.map(colour =>
    colour === "#5ba591" || String(colour).toUpperCase() === "#9966FF" ? "#000000" : colour
  ));
};

const noteNameToPython = (input: BlockInput.Any, inputToPython: MartyInputToPython): string => {
  const value = staticValue(input);
  if (value === undefined) return inputToPython(input, "string");
  const parsed = parseNestedJSON(value);
  if (parsed && typeof parsed === "object" && parsed.name) return pythonString(parsed.name);
  return pythonString(parsed);
};

const secondsToMilliseconds = (input: BlockInput.Any, inputToPython: MartyInputToPython): string =>
  `int((${inputToPython(input, "number")}) * 1000)`;

/**
 * Translate a Marty extension block. Returns null for non-Marty opcodes so the
 * legacy Scratch translator can handle them.
 */
export default function martyBlockToPython(block: Block, inputToPython: MartyInputToPython): string | null {
  const input = (name: string): BlockInput.Any => block.inputs[name] as BlockInput.Any;
  const number = (name: string): string => inputToPython(input(name), "number");
  const any = (name: string): string => inputToPython(input(name), "any");
  const string = (name: string): string => inputToPython(input(name), "string");

  switch (block.opcode) {
    // Motion
    case OpCode.mv2_getReady:
      return "my_marty.get_ready()";
    case OpCode.mv2_walk_fw:
      return `my_marty.walk(num_steps=${number("STEPS")}, turn=0, step_length=25)`;
    case OpCode.mv2_walk_bw:
      return `my_marty.walk(num_steps=${number("STEPS")}, turn=0, step_length=-25)`;
    case OpCode.mv2_walk:
      return `my_marty.walk(num_steps=${number("STEPS")}, turn=max(-25, min(25, int(${number("TURN")}))), ` +
        `step_length=max(-50, min(50, int(${number("STEPLEN")}))), ` +
        `move_time=max(1, min(10000, ${secondsToMilliseconds(input("MOVETIME"), inputToPython)})))`;
    case OpCode.mv2_turn: {
      const side = staticValue(input("SIDE"));
      const turn = String(side) === "1" ? -20 : 20;
      return `my_marty.walk(num_steps=${number("STEPS")}, turn=${turn}, step_length=1, move_time=1500)`;
    }
    case OpCode.mv2_wiggle:
      return "my_marty.wiggle(move_time=4000)";
    case OpCode.mv2_circle:
      return `my_marty.circle_dance(${mappedStaticString(input("SIDE"), SIDE_NAMES, inputToPython)}, ` +
        `move_time=max(1, min(10000, ${secondsToMilliseconds(input("MOVETIME"), inputToPython)})))`;
    case OpCode.mv2_kick:
      return `my_marty.kick(${mappedStaticString(input("SIDE"), SIDE_NAMES, inputToPython)}, move_time=3000)`;
    case OpCode.mv2_lean:
      return `my_marty.lean(direction=${mappedStaticString(input("SIDE"), DIRECTION_NAMES, inputToPython)}, ` +
        `move_time=max(1, min(10000, ${secondsToMilliseconds(input("MOVETIME"), inputToPython)})))`;
    case OpCode.mv2_slide:
      return `my_marty.sidestep(${mappedStaticString(input("SIDE"), SIDE_NAMES, inputToPython)}, ` +
        `steps=${number("STEPS")}, step_length=35, move_time=1000)`;
    case OpCode.mv2_slideMsLength:
      return `my_marty.sidestep(${mappedStaticString(input("SIDE"), SIDE_NAMES, inputToPython)}, ` +
        `steps=${number("STEPS")}, step_length=${number("STEPLEN")}, ` +
        `move_time=${secondsToMilliseconds(input("MOVETIME"), inputToPython)})`;
    case OpCode.mv2_eyes:
      return `my_marty.eyes(${mappedStaticString(input("COMMAND"), EYE_POSES, inputToPython)})`;
    case OpCode.mv2_moveLeg:
      return `my_marty.move_joint(joint_name_or_num=${number("SIDE")}, position=${number("DIRECTION")}, move_time=1000)`;
    case OpCode.mv2_liftFoot:
      return `my_marty.lift_foot(${mappedStaticString(input("SIDE"), SIDE_NAMES, inputToPython)})`;
    case OpCode.mv2_lowerFoot:
      return `my_marty.lower_foot(${mappedStaticString(input("SIDE"), SIDE_NAMES, inputToPython)})`;
    case OpCode.mv2_moveJoint:
      return `my_marty.move_joint(joint_name_or_num=${mappedStaticString(input("SERVOCHOICE"), JOINT_NAMES, inputToPython)}, ` +
        `position=${number("ANGLE")}, move_time=${secondsToMilliseconds(input("MOVETIME"), inputToPython)})`;
    case OpCode.mv2_wave:
      return `my_marty.wave(${mappedStaticString(input("SIDE"), SIDE_NAMES, inputToPython)})`;
    case OpCode.mv2_stop:
      return String(staticValue(input("STOP_TYPE"))) === "stopAfterMove" ?
        'my_marty.stop("clear queue")' : 'my_marty.stop("clear and stop")';
    case OpCode.mv2_pause:
      return "my_marty.pause()";
    case OpCode.mv2_resume:
      return "my_marty.resume()";
    case OpCode.mv2_dance:
      return "my_marty.dance(move_time=3000)";
    case OpCode.mv2_standStraight:
      return `my_marty.stand_straight(move_time=${secondsToMilliseconds(input("MOVETIME"), inputToPython)})`;
    case OpCode.mv2_hold:
      return `my_marty.hold_position(${secondsToMilliseconds(input("MOVETIME"), inputToPython)})`;
    case OpCode.mv2_gripperArmBasic:
      return `my_marty.gripper(${mappedStaticString(input("HAND_POSITION"), ["open", "close"], inputToPython)}, move_time=1000)`;
    case OpCode.mv2_gripperArmTimed:
      return `my_marty.gripper(${mappedStaticString(input("HAND_POSITION"), ["open", "close"], inputToPython)}, ` +
        `move_time=${secondsToMilliseconds(input("MOVETIME"), inputToPython)})`;

    // Looks and colour operators
    case OpCode.mv2_discoChangeBlockPattern:
      return `my_marty.disco_named_pattern(add_on=${boardAttribute(input("BOARDTYPE"), "name", inputToPython)}, ` +
        `pattern=${string("PATTERN")})`;
    case OpCode.mv2_LEDEyesColour:
      return `my_marty.disco_color(color=${colourToPython(input("COLOUR_LED_EYES"), inputToPython)}, ` +
        `add_on=${boardAttribute(input("BOARDTYPE"), "name", inputToPython)}, api="led")`;
    case OpCode.mv2_LEDEyesColour_SpecificLED:
      return `my_marty.disco_color_specific_led(color=${colourToPython(input("COLOUR_LED_EYES"), inputToPython)}, ` +
        `add_on=${boardAttribute(input("BOARDTYPE"), "name", inputToPython)}, ` +
        `add_on_who_am_i=${boardAttribute(input("BOARDTYPE"), "whoAmI", inputToPython)}, led_id=${number("LED_POSITION")})`;
    case OpCode.colour_picker_LED_eyes:
      return eyePickerToPython(input("COLOUR"), inputToPython);
    case OpCode.mv2_LEDEyesColourLEDs:
      return `my_marty.disco_color_eyepicker(colours=${eyePickerToPython(input("COLOUR_LED_EYES") || input("COLOUR"), inputToPython)}, ` +
        `add_on=${boardAttribute(input("SIDE"), "name", inputToPython)})`;
    case OpCode.mv2_turnAllLEDsOff:
      return "my_marty.disco_off_all()";
    case OpCode.mv2_discoChangeBackColour:
      return `my_marty.function_led(colour=${colourToPython(input("COLOR"), inputToPython)}, breathe="on")`;
    case OpCode.mv2_discoSetBreatheBackColour:
      return `my_marty.function_led(colour=${colourToPython(input("COLOR"), inputToPython)}, ` +
        `breathe="breathe", breath_ms=${number("MILLISECONDS")})`;
    case OpCode.mv2_discoTurnOffBackColour:
      return "my_marty.function_led_off()";
    case OpCode.mv2_discoChangeRegionColour:
      return `my_marty.disco_color(region=${number("REGION")}, ` +
        `add_on=${boardAttribute(input("BOARDTYPE"), "name", inputToPython)}, ` +
        `color=${colourToPython(input("COLOR"), inputToPython)}, api="led")`;
    case OpCode.mv2_RGBOperator:
      return `my_marty.rgb_operator(${number("NUM_R")}, ${number("NUM_G")}, ${number("NUM_B")})`;
    case OpCode.mv2_HSLOperator:
      return `my_marty.hsv_operator(${number("NUM_H")}, ${number("NUM_S")}, ${number("NUM_L")})`;
    case OpCode.nearest_note:
      return `my_marty.nearest_note(${number("FREQUENCY")})`;

    // Sound. These names intentionally describe the Scratch semantics; the
    // in-app Marty compatibility layer supplies them when martypy does not.
    case OpCode.mv2_playSound:
      return `my_marty.play_project_sound(${string("SOUND_MENU")}, blocking=False)`;
    case OpCode.mv2_playSoundUntilDone:
      return `my_marty.play_project_sound(${string("SOUND_MENU")}, blocking=True)`;
    case OpCode.mv2_playNote:
      return `my_marty.play_project_note(${noteNameToPython(input("NOTES_MENU"), inputToPython)})`;
    case OpCode.mv2_playTone:
      return `my_marty.play_tone(${number("HZ1")}, ${number("HZ2")}, ${number("SECONDS")})`;
    case OpCode.mv2_stopSounds:
      return "my_marty.stop_sounds()";
    case OpCode.mv2_changePitchEffect:
      return `my_marty.change_pitch_effect(${number("VALUE")})`;
    case OpCode.mv2_setPitchEffect:
      return `my_marty.set_pitch_effect(${number("VALUE")})`;
    case OpCode.mv2_clearSoundEffects:
      return "my_marty.clear_sound_effects()";
    case OpCode.mv2_changeVolume:
      return `my_marty.change_volume(${number("VOLUME")})`;
    case OpCode.mv2_setVolume:
      return `my_marty.set_volume(${number("VOLUME")})`;

    // Sensors
    case OpCode.XAxisMovement:
      return 'my_marty.get_accelerometer("x")';
    case OpCode.YAxisMovement:
      return 'my_marty.get_accelerometer("y")';
    case OpCode.ZAxisMovement:
      return 'my_marty.get_accelerometer("z")';
    case OpCode.XAxisMagnetometer:
      return 'my_marty.get_magnetometer("x")';
    case OpCode.YAxisMagnetometer:
      return 'my_marty.get_magnetometer("y")';
    case OpCode.ZAxisMagnetometer:
      return 'my_marty.get_magnetometer("z")';
    case OpCode.BatteryPercentage:
      return "my_marty.get_battery_remaining()";
    case OpCode.ServoCurrent:
      return `my_marty.get_joint_current(${mappedStaticString(input("SERVOCHOICE"), JOINT_NAMES, inputToPython)})`;
    case OpCode.ServoPosition:
      return `my_marty.get_joint_position(${mappedStaticString(input("SERVOCHOICE"), JOINT_NAMES, inputToPython)})`;
    case OpCode.mv2_obstaclesense:
      return `my_marty.foot_obstacle_sensed(${string("SENSORCHOICE")})`;
    case OpCode.mv2_groundsense:
      return `my_marty.foot_on_ground(${string("SENSORCHOICE")})`;
    case OpCode.mv2_coloursense:
      return `my_marty.get_color_sensor_color(${string("SENSORCHOICE")})`;
    case OpCode.mv2_coloursense_hex:
      return `my_marty.get_color_sensor_hex(${string("SENSORCHOICE")})`;
    case OpCode.mv2_coloursenseraw:
      return `my_marty.get_color_sensor_value_by_channel(${string("SENSORCHOICE")}, ${string("SENSORCHANNEL")})`;
    case OpCode.mv2_distancesense:
      return "my_marty.get_distance_sensor()";
    case OpCode.mv2_lightsense:
      return `my_marty.get_light_sensor(${string("SENSORCHOICE")}, ${string("SENSORCHANNEL")})`;
    case OpCode.mv2_noisesense:
      return `my_marty.get_noise_sensor(${string("SENSORCHOICE")})`;

    // Marty sensor hats are consumed as hats by Script and do not emit a line.
    case OpCode.mv2_onObjectSense:
    case OpCode.mv2_onLightSense:
    case OpCode.mv2_onNoiseSense:
    case OpCode.mv2_onColourSense:
      return "";

    case OpCode.text2speech_marty_speakAndWait:
      return `my_marty.speak(${any("WORDS")}, blocking=True)`;
    default:
      return null;
  }
}
