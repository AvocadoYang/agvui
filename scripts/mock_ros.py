#!/usr/bin/env python3
"""
模擬 UI 會訂閱的所有 ROS topic，給 UI 開發測試用（不需要實車）。

  /kenmec_fork/vehicle_status                  std_msgs/String (JSON)
  /kenmec_fork/io_info                         std_msgs/String (JSON)
  /kenmec_fork/error_info                      std_msgs/String (JSON)
  /kenmec_fork/has_mission                     std_msgs/Bool
  /kenmec_fork/fleet_manager/mission/feedback  kenmec_fork_socket/MissionActionFeedback
  /mission_control/read/status                 std_msgs/String (JSON)
  /mission_control/write/status                std_msgs/String (JSON)
  /hdl_odom                                    nav_msgs/Odometry

假任務會一直循環：待命 → 前進 → 旋轉 → 取貨 → 後退 → 放貨 → 充電 → 待命 …
欄位對照：src/ros/types.ts、src/cheat_sheet/*.jsonc

用法：
  source /opt/ros/noetic/setup.zsh
  source ~/cor_ws/devel/setup.zsh      # 有 kenmec_fork_socket 才能發 mission feedback，沒有會自動略過
  /usr/bin/python3 scripts/mock_ros.py                 # 每 0.5 秒發一次，全部正常
  /usr/bin/python3 scripts/mock_ros.py --interval 1    # 改成每 1 秒
  /usr/bin/python3 scripts/mock_ros.py --demo          # 加上輪流出現的異常、警報、錯誤訊息
  /usr/bin/python3 scripts/mock_ros.py --step 6        # 每個任務步驟停留 6 秒（預設 4）

  # 只模擬指定動作（看車輛卡片的動畫用），每個動作停留 --step 秒後換下一個
  /usr/bin/python3 scripts/mock_ros.py --action S                  # 一直旋轉
  /usr/bin/python3 scripts/mock_ros.py --action F,B,clamp          # 依序輪播
  /usr/bin/python3 scripts/mock_ros.py --action all --step 3       # 所有動作輪播
  /usr/bin/python3 scripts/mock_ros.py --action list               # 列出可用的動作代碼
"""
import argparse
import copy
import json
import math
import random

import rospy
from nav_msgs.msg import Odometry
from std_msgs.msg import Bool, String

try:
    from actionlib_msgs.msg import GoalStatus
    from kenmec_fork_socket.msg import MissionActionFeedback

    HAS_FEEDBACK_MSG = True
except ImportError:
    HAS_FEEDBACK_MSG = False


# ---------------------------------------------------------------------------
# 假任務劇本：每一步停留 --step 秒
# code = action_process（對照 types.ts MissionFeedback 上方註解）
# ---------------------------------------------------------------------------
STEPS = [
    # code,      operation.type, 前進速度, 轉彎速度, 牙叉高度 mm, 說明
    (None, None, 0.0, 0.0, 0, "待命"),
    ("F", "move", 0.8, 0.0, 0, "前進"),
    ("S", "spin", 0.0, 0.5, 0, "旋轉"),
    ("FH", "move", 0.3, 0.0, 300, "前進加枒杈調整"),
    ("load", "load", 0.0, 0.0, 800, "取貨"),
    ("B", "move", -0.5, 0.0, 800, "後退"),
    ("SH", "spin", 0.0, -0.4, 600, "旋轉加枒杈調整"),
    ("offload", "offload", 0.0, 0.0, 100, "放貨"),
    ("fork_height", "fork", 0.0, 0.0, 0, "調整高度"),
    ("charge", "charge", 0.0, 0.0, 0, "充電"),
]

# --action 可用的動作：code -> (operation.type, 前進速度, 轉彎速度, 牙叉高度 mm, 說明)
ACTIONS = {
    "F": ("move", 0.8, 0.0, 0, "前進"),
    "B": ("move", -0.5, 0.0, 0, "後退"),
    "FH": ("move", 0.3, 0.0, 300, "前進加枒杈調整"),
    "BH": ("move", -0.3, 0.0, 300, "後退加枒杈調整"),
    "S": ("spin", 0.0, 0.5, 0, "旋轉"),
    "SH": ("spin", 0.0, -0.4, 600, "旋轉加枒杈調整"),
    "H": ("fork", 0.0, 0.0, 500, "枒杈調整"),
    "tilt": ("fork", 0.0, 0.0, 500, "調整傾角"),
    "fork_height": ("fork", 0.0, 0.0, 800, "調整高度"),
    "clamp": ("clamp", 0.0, 0.0, 500, "調整夾具"),
    "verity_cargo": ("camera", 0.0, 0.0, 500, "影像貨物分類"),
    "cargo_limit": ("camera", 0.0, 0.0, 500, "貨物高度檢測"),
    "load": ("load", 0.0, 0.0, 800, "取貨"),
    "offload": ("offload", 0.0, 0.0, 100, "放貨"),
    "charge": ("charge", 0.0, 0.0, 0, "充電"),
}


def build_steps(spec):
    """--action 參數 → 步驟清單（格式同 STEPS）"""
    codes = list(ACTIONS) if spec == "all" else [c.strip() for c in spec.split(",") if c.strip()]
    unknown = [c for c in codes if c not in ACTIONS]
    if unknown or not codes:
        raise SystemExit(f"未知的動作代碼：{', '.join(unknown) or '(空)'}；可用：{', '.join(ACTIONS)}")
    return [(c, *ACTIONS[c]) for c in codes]


MISSION_NAMES = ["A01", "B03", "C07"]
LOCATIONS = ["Station-1", "Rack-12", "Rack-27", "Charger-1"]

# ---------------------------------------------------------------------------
# /kenmec_fork/vehicle_status
# ---------------------------------------------------------------------------
VEHICLE_NORMAL = {
    "vehicle_connected_and_position_correct": True,
    "charging_station_connected": True,
    "firmware_status_connected": True,
    "front_2d_lidar": {"enable_2d_lidar": True, "obstacle_2d_left": False, "obstacle_2d_right": False, "front_2d_layer": 0},
    "front_3d_lidar_enabled": True,
    "rear_2d_lidar": {"enable_2d_lidar": True, "obstacle_2d_rear": False, "rear_2d_layer": 0, "mute_status": False},
    "fork_tip": {"enable_tip": True, "left_tip": False, "right_tip": False},
    "baffle": {"enable_baffle": True, "baffle_left": 0.0, "baffle_right": 0.0},
    "anti_collision_strip_enabled": True,
    "e_stop_enabled": True,
    "auto_mode_enabled": True,
    "battery_below_35_percent": False,
    "battery_temperature_normal": True,
    "abnormal_feedback": "",
}

# --demo：每 5 秒輪流讓一項異常 (路徑, 異常值, abnormal_feedback)
VEHICLE_FAULTS = [
    (["vehicle_connected_and_position_correct"], False, "定位異常"),
    (["charging_station_connected"], False, "充電站未連線"),
    (["firmware_status_connected"], False, "韌體板連線中斷"),
    (["rear_2d_lidar", "enable_2d_lidar"], False, "後方 2D 光達未啟動"),
    (["front_3d_lidar_enabled"], False, "3D 光達未啟動"),
    (["fork_tip", "enable_tip"], False, "杈尖傳感器未啟動"),
    (["baffle", "enable_baffle"], False, "擋板未開啟"),
    (["e_stop_enabled"], False, "E-Stop 未啟動"),
    (["anti_collision_strip_enabled"], False, "防撞邊條未啟動"),
    (["battery_temperature_normal"], False, "電池溫度異常"),
    (None, None, ""),
    (None, None, ""),
]

# --demo：io_info 警報，每 7 秒輪流 (欄位路徑, 觸發值)
IO_ALARMS = [
    None,
    (["bumper"], 1),
    None,
    (["lidar", "obstacle_2d_signal"], 1),
    None,
    (["emergency_stop"], 1),
    None,
    (["lidar", "obstacle_2d_left_layer"], "111"),
]

# --demo：error_info，每 11 秒輪流
ERRORS = [
    [],
    [(101, "前方有障礙物，等待通過")],
    [],
    [(205, "取貨失敗：未偵測到棧板"), (310, "電池電壓偏低")],
]


def set_path(obj, path, value):
    for key in path[:-1]:
        obj = obj[key]
    obj[path[-1]] = value


def rotate(items, elapsed, period):
    return items[int(elapsed // period) % len(items)]


class MockRos:
    def __init__(self, args):
        self.args = args
        self.steps = build_steps(args.action) if args.action else STEPS
        # 第一個有任務的步驟 = 新的一輪任務開始
        self.first_mission_step = next(i for i, step in enumerate(self.steps) if step[0])
        self.start = rospy.get_time()
        self.battery = 85.0
        self.goal_seq = 0
        self.last_step = -1
        self.last_logged = {}

        latch = dict(queue_size=10)
        self.pub = {
            "vehicle": rospy.Publisher("/kenmec_fork/vehicle_status", String, **latch),
            "io": rospy.Publisher("/kenmec_fork/io_info", String, **latch),
            "error": rospy.Publisher("/kenmec_fork/error_info", String, **latch),
            "has_mission": rospy.Publisher("/kenmec_fork/has_mission", Bool, **latch),
            "read": rospy.Publisher("/mission_control/read/status", String, **latch),
            "write": rospy.Publisher("/mission_control/write/status", String, **latch),
            "odom": rospy.Publisher("/hdl_odom", Odometry, **latch),
        }
        if HAS_FEEDBACK_MSG:
            self.pub["feedback"] = rospy.Publisher(
                "/kenmec_fork/fleet_manager/mission/feedback", MissionActionFeedback, **latch
            )
        else:
            rospy.logwarn(
                "找不到 kenmec_fork_socket 訊息，略過 /kenmec_fork/fleet_manager/mission/feedback"
                "（請先 source ~/cor_ws/devel/setup.zsh）"
            )

    # ------------------------------------------------------------------ helpers
    def log_once(self, key, text):
        if self.last_logged.get(key) != text:
            self.last_logged[key] = text
            rospy.loginfo(text)

    def step(self, elapsed):
        idx = int(elapsed // self.args.step) % len(self.steps)
        if idx != self.last_step:
            if idx == self.first_mission_step:
                self.goal_seq += 1  # 新的一輪任務
            self.last_step = idx
        code, op_type, vx, wz, height, desc = self.steps[idx]
        progress = (elapsed % self.args.step) / self.args.step
        return idx, code, op_type, vx, wz, height, desc, progress

    # ------------------------------------------------------------------ builders
    def vehicle_status(self, elapsed):
        msg = copy.deepcopy(VEHICLE_NORMAL)
        msg["battery_below_35_percent"] = self.battery < 35
        if self.args.demo:
            path, value, text = rotate(VEHICLE_FAULTS, elapsed, 5)
            if path:
                set_path(msg, path, value)
                msg["abnormal_feedback"] = text
            self.log_once("vehicle", f"[vehicle_status] {text or '全部正常'}")
        return msg

    def io_info(self, elapsed, vx, wz, height, charging):
        msg = {
            "heartBeatSignal": 0,
            "error_code": 0,
            "manual_mode": 1,
            "recovery": 0,
            "enable_reboot": 0,
            "emergency_stop": 0,
            "bumper": 0,
            "enforce_charge": 0,
            "enable_tip": 1,
            "tip_left": 0,
            "tip_right": 0,
            "enable_baffle": 1,
            "baffle_left": round(random.uniform(18, 22), 1),
            "baffle_right": round(random.uniform(18, 22), 1),
            "enable_ultrasound": 1,
            "enable_ultrasound_front": 1,
            "enable_ultrasound_side": 1,
            "ultrasound": [round(random.uniform(0.8, 3.0), 2) for _ in range(4)],
            "battery_info": {
                "set_charge": 0 if charging else 1,
                "battery": round(self.battery, 2),
                "voltage": round(46 + self.battery / 100 * 6, 2),
                "current": round(15.0 if charging else -abs(vx) * 20 - 2, 2),
                "charging": 1 if charging else 0,
            },
            "lidar": {
                "enable_2d_lidar": 1,
                "front_2d_layer": 0,
                "obstacle_2d_signal": 0,
                "obstacle_2d_left_layer": "000",
                "obstacle_2d_right_layer": "000",
                "enable_rear_2d_lidar": 1,
                "obstacle_rear_2d_signal": 0,
                "obstacle_3d_signal": 0,
            },
            "twist": {
                "set_linear_x": vx,
                "set_angular_z": wz,
                "odom_linear_x": round(vx + random.uniform(-0.02, 0.02), 3) if vx else 0.0,
                "odom_angular_z": round(wz + random.uniform(-0.02, 0.02), 3) if wz else 0.0,
            },
            "fork": {
                "set_height": height,
                "current_height": height,
                "set_clamp": 0,
                "current_clamp": 0,
            },
        }
        if self.args.demo:
            alarm = rotate(IO_ALARMS, elapsed, 7)
            if alarm:
                set_path(msg, *alarm)
            self.log_once("io", f"[io_info] 警報：{'.'.join(alarm[0]) if alarm else '無'}")
        return msg

    def error_info(self, elapsed):
        errors = rotate(ERRORS, elapsed, 11) if self.args.demo else []
        if self.args.demo:
            self.log_once("error", f"[error_info] {[m for _, m in errors] or '無'}")
        return {"warning_id": [i for i, _ in errors], "warning_msg": [m for _, m in errors]}

    def mission_ids(self):
        name = MISSION_NAMES[self.goal_seq % len(MISSION_NAMES)]
        start = LOCATIONS[self.goal_seq % len(LOCATIONS)]
        end = LOCATIONS[(self.goal_seq + 1) % len(LOCATIONS)]
        return name, start, end, f"mock-goal-{self.goal_seq}"

    def operation(self, op_type, code):
        return {
            "type": op_type or "",
            "control": [code] if code else [],
            "wait": 0,
            "is_define_id": False,
            "id": 0,
            "is_define_yaw": False,
            "multiLoc": [],
            "selectBy": None,
            "yaw": 0.0,
            "tolerance": 0.1,
            "lookahead": 0.5,
            "roughly_pass": False,
            "from": 1,
            "to": 5,
            "max_speed": 1.0,
            "hasCargoToProcess": op_type in ("load", "offload"),
        }

    def write_status(self, idx, code, op_type, height, has_mission, warning_msg):
        name, start, end, goal_id = self.mission_ids()
        return {
            "write": {
                "send_mission": [1, 5] if has_mission else [],
                "check_mission": [],
                "start_mission": has_mission,
                "cancel_mission": False,
                "pause": False,
                "canTakeGoods": op_type == "load",
                "canDropGoods": op_type == "offload",
                "heartbeat": int(rospy.get_time()) % 256,
                "charge_mission": op_type == "charge",
            },
            "region": {"regionType": "normal", "max_height": 2000, "min_height": 0, "max_speed": 1.2},
            "action": {
                "operation": self.operation(op_type, code),
                "io": {
                    "fork": {"is_define_height": True, "execute": op_type == "fork", "height": height, "move": 0, "shift": 0, "tilt": 0},
                    "camera": {"execute": False, "config": 0, "modify_dis": 0},
                },
                "cargo_limit": {"load": 1000, "offload": 1000},
                "mission_status": {
                    "feedback_id": goal_id if has_mission else "",
                    "name": [name] if has_mission else [],
                    "start": start if has_mission else "",
                    "end": end if has_mission else "",
                    "bookBlock": ["B1", "B2"] if has_mission else None,
                    "load_level": 1 if op_type == "load" else None,
                    "offload_level": 2 if op_type == "offload" else None,
                },
            },
        }

    def read_status(self, idx, code, op_type, height, has_mission, charging, warning_msg):
        last_op = self.operation(op_type, code)
        return {
            "read": {
                "is_arrive": not has_mission,
                "is_locations": [1, 5],
                "checked_locations": [],
                "is_drop_goods": op_type == "offload",
                "is_dropping_goods": op_type == "offload",
                "is_take_goods": op_type == "load",
                "is_taking_goods": op_type == "load",
                "with_goods": 4 <= idx <= 7,
                "is_finished_mission": not has_mission,
                "isReadyCharge": charging,
            },
            "info": {
                "amr_id": 1,
                "activated": 1,
                "is_running": has_mission,
                "warning_msg": warning_msg,
                "warning_id": 101 if warning_msg else 0,
                "warning": 1 if warning_msg else 0,
                "debug": f"step {idx}: {code or 'idle'}",
                "task_process": idx,
                "action_process": code or "",
                "charging": charging,
                "cargo_status": 1 if 4 <= idx <= 7 else 0,
                "heartbeat": int(rospy.get_time()) % 256,
                "error": "",
            },
            "check": {
                "isCancelSiganl": False,
                "breakSignal": False,
                "last_action_status": code or "",
                "last_charge_status": charging,
                "last_write_status": last_op,
            },
        }

    def feedback(self, idx, code, has_mission, progress, warning_msg):
        _, _, _, goal_id = self.mission_ids()
        now = rospy.Time.now()
        msg = MissionActionFeedback()
        msg.header.stamp = now
        msg.header.frame_id = ""
        msg.status.goal_id.stamp = now
        msg.status.goal_id.id = goal_id if has_mission else ""
        msg.status.status = GoalStatus.ACTIVE if has_mission else GoalStatus.SUCCEEDED
        msg.status.text = code or "idle"
        msg.feedback.feedback_json = json.dumps(
            {
                "task_process": idx,
                "navigation_status": has_mission,
                "warning": 1 if warning_msg else 0,
                "warning_id": 101 if warning_msg else 0,
                "warning_msg": warning_msg,
                "is_running": has_mission and progress < 0.9,
                "cancel_task": False,
                "task_status": has_mission,
                "action_process": code or "",
            },
            ensure_ascii=False,
        )
        return msg

    def odom(self, elapsed):
        # 繞一個 4m × 2.5m 的橢圓
        t = elapsed * 0.1
        x, y = 4 * math.cos(t), 2.5 * math.sin(t)
        yaw = math.atan2(2.5 * math.cos(t), -4 * math.sin(t))
        msg = Odometry()
        msg.header.stamp = rospy.Time.now()
        msg.header.frame_id = "map"
        msg.child_frame_id = "base_link"
        msg.pose.pose.position.x = x
        msg.pose.pose.position.y = y
        msg.pose.pose.orientation.z = math.sin(yaw / 2)
        msg.pose.pose.orientation.w = math.cos(yaw / 2)
        return msg

    # ------------------------------------------------------------------ loop
    def tick(self):
        elapsed = rospy.get_time() - self.start
        idx, code, op_type, vx, wz, height, desc, progress = self.step(elapsed)
        has_mission = code is not None
        charging = op_type == "charge"
        self.log_once("step", f"[mission] {idx}: {desc}" + (f" ({code})" if code else ""))

        # 電量：充電時上升，其他時候慢慢掉
        rate = self.args.interval
        self.battery = min(100.0, self.battery + 0.5 * rate) if charging else max(20.0, self.battery - 0.05 * rate)

        warning_msg = "前方有障礙物，等待通過" if self.args.demo and idx == 3 else ""

        pub = lambda key, data: self.pub[key].publish(String(data=json.dumps(data, ensure_ascii=False)))
        pub("vehicle", self.vehicle_status(elapsed))
        pub("io", self.io_info(elapsed, vx, wz, height, charging))
        pub("error", self.error_info(elapsed))
        pub("write", self.write_status(idx, code, op_type, height, has_mission, warning_msg))
        pub("read", self.read_status(idx, code, op_type, height, has_mission, charging, warning_msg))
        self.pub["has_mission"].publish(Bool(data=has_mission))
        self.pub["odom"].publish(self.odom(elapsed))
        if "feedback" in self.pub:
            self.pub["feedback"].publish(self.feedback(idx, code, has_mission, progress, warning_msg))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--interval", type=float, default=0.5, help="發送間隔秒數（預設 0.5）")
    parser.add_argument("--step", type=float, default=4.0, help="每個任務步驟停留秒數（預設 4）")
    parser.add_argument("--demo", action="store_true", help="加上輪流出現的異常、警報、錯誤訊息")
    parser.add_argument(
        "--action",
        metavar="CODES",
        help="只模擬指定動作，逗號分隔（例：S 或 F,B,clamp），all = 全部輪播，list = 列出代碼",
    )
    args = parser.parse_args(rospy.myargv()[1:])

    if args.action == "list":
        for code, (_, _, _, _, desc) in ACTIONS.items():
            print(f"  {code:<14}{desc}")
        return
    if args.action:
        build_steps(args.action)  # 先檢查代碼，打錯字就不用等 ROS 初始化

    rospy.init_node("mock_ros", anonymous=True)
    mock = MockRos(args)
    rospy.loginfo(
        f"mock_ros 開始發送：每 {args.interval}s，步驟 {args.step}s，demo={args.demo}，"
        f"動作={','.join(s[0] for s in mock.steps if s[0]) if args.action else '預設劇本'}"
    )

    rate = rospy.Rate(1.0 / args.interval)
    while not rospy.is_shutdown():
        mock.tick()
        try:
            rate.sleep()
        except rospy.ROSInterruptException:
            break


if __name__ == "__main__":
    main()
