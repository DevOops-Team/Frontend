// 가이드 실행기에서 고른 값으로 job.yaml(JobSet)을 만든다. 사용자는 YAML을 직접 쓰지 않는다.
// 기본값으로 만들면 src/examples/job.yaml(백엔드 예시)과 같은 JobSet이 나온다(jobTemplate.test.ts).
// 백엔드가 이름·namespace·큐 라벨·S3 볼륨·affinity·toleration을 채우므로 여기서는 학습에 필요한 것만 쓴다.

export interface Hardware {
  id: string;
  gpu: string; // GPU 모델
  gpus: number; // 노드당 GPU 수 (= torchrun --nproc-per-node)
  instanceType: string;
  vcpu: number;
  memoryGiB: number;
  cpu: string; // Pod requests.cpu (kubelet·sidecar 몫을 남긴다)
  memory: string; // Pod requests/limits.memory
  note: string;
}

export const HARDWARE: Hardware[] = [
  {
    id: 't4-1', gpu: 'T4', gpus: 1, instanceType: 'g4dn.xlarge', vcpu: 4, memoryGiB: 16,
    cpu: '3', memory: '12Gi', note: '가볍게 돌려 보기 좋은 기본 사양',
  },
  {
    id: 'a10g-1', gpu: 'A10G', gpus: 1, instanceType: 'g5.xlarge', vcpu: 4, memoryGiB: 16,
    cpu: '3', memory: '12Gi', note: 'T4보다 약 3배 빠른 학습',
  },
  {
    id: 'l4-1', gpu: 'L4', gpus: 1, instanceType: 'g6.xlarge', vcpu: 4, memoryGiB: 16,
    cpu: '3', memory: '12Gi', note: '최신 세대, 전력 대비 성능',
  },
  {
    id: 't4-4', gpu: 'T4', gpus: 4, instanceType: 'g4dn.12xlarge', vcpu: 48, memoryGiB: 192,
    cpu: '44', memory: '168Gi', note: '노드 하나에 GPU 4개',
  },
];

export interface JobOptions {
  name: string;
  hardwareId: string;
  nodes: number;
  spot: boolean;
  totalSteps: number;
  ckptEvery: number;
  maxRestarts: number;
  image: string;
}

export const MIN_NODES = 1;
export const MAX_NODES = 4;
export const DEFAULT_IMAGE = 'pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime';

export const DEFAULT_OPTIONS: JobOptions = {
  name: 'ddp-run',
  hardwareId: 't4-1',
  nodes: 2,
  spot: false,
  totalSteps: 5000,
  ckptEvery: 1000,
  maxRestarts: 3,
  image: DEFAULT_IMAGE,
};

export function hardwareOf(o: Pick<JobOptions, 'hardwareId'>): Hardware {
  return HARDWARE.find((h) => h.id === o.hardwareId) ?? HARDWARE[0];
}

export function totalGpus(o: JobOptions): number {
  return o.nodes * hardwareOf(o).gpus;
}

export type OptionErrors = Partial<Record<keyof JobOptions, string>>;

const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

export function validateOptions(o: JobOptions): OptionErrors {
  const errors: OptionErrors = {};
  const int = (n: number) => Number.isInteger(n);
  if (!DNS_LABEL.test(o.name) || o.name.length > 40) {
    errors.name = '소문자·숫자·하이픈(-)만, 40자 이내로 입력하세요';
  }
  if (!int(o.nodes) || o.nodes < MIN_NODES || o.nodes > MAX_NODES) {
    errors.nodes = `노드는 ${MIN_NODES}~${MAX_NODES}대입니다`;
  }
  if (!int(o.totalSteps) || o.totalSteps < 1) {
    errors.totalSteps = '1 이상의 정수를 입력하세요';
  }
  if (!int(o.ckptEvery) || o.ckptEvery < 1) {
    errors.ckptEvery = '1 이상의 정수를 입력하세요';
  } else if (int(o.totalSteps) && o.ckptEvery > o.totalSteps) {
    errors.ckptEvery = '총 step보다 클 수 없습니다';
  }
  if (!int(o.maxRestarts) || o.maxRestarts < 0 || o.maxRestarts > 10) {
    errors.maxRestarts = '0~10 사이로 입력하세요';
  }
  if (o.image.trim() === '') {
    errors.image = '컨테이너 이미지를 입력하세요';
  }
  return errors;
}

// 평범한 이미지 참조는 그대로, YAML이 잘못 읽을 수 있는 값은 큰따옴표로 감싼다.
function scalar(s: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(s) ? s : JSON.stringify(s);
}

export function buildJobYaml(o: JobOptions): string {
  const hw = hardwareOf(o);
  const image = scalar(o.image.trim());
  const lines = [
    `# DevOops 가이드 실행기로 만든 job.yaml (${hw.gpu} × ${hw.gpus} / ${hw.instanceType} ${o.nodes}대, 총 GPU ${totalGpus(o)}개).`,
    '# 백엔드가 이름·namespace·큐 라벨·S3 볼륨·affinity·toleration을 채운다.',
    `# 용량 유형: ${o.spot ? 'Spot 선호 (참고용 — 실제 노드 용량 유형은 클러스터의 Karpenter가 정한다)' : 'On-Demand'}`,
    'apiVersion: jobset.x-k8s.io/v1alpha2',
    'kind: JobSet',
    'metadata:',
    `  name: ${o.name} # 백엔드가 job-<id>로 바꾼다`,
    'spec:',
    '  failurePolicy:',
    `    maxRestarts: ${o.maxRestarts} # Pod 하나라도 실패하면 모든 Pod를 같이 다시 띄우고 /ckpt에서 재개한다`,
    '  replicatedJobs:',
    '  - name: trainer',
    '    replicas: 1',
    '    template:',
    '      spec:',
    `        parallelism: ${o.nodes}`,
    `        completions: ${o.nodes}`,
    '        completionMode: Indexed',
    '        backoffLimit: 0',
    '        template:',
    '          spec:',
    '            restartPolicy: Never',
    '            containers:',
    '            - name: trainer',
    `              image: ${image}`,
    '              command: ["bash", "-c"]',
    '              args:',
    '              - |',
    '                set -e',
    '                export MASTER_ADDR="${JOBSET_NAME}-trainer-0-0.${JOBSET_NAME}"',
    '                # rank 0 Pod의 DNS가 생길 때까지 기다린다.',
    '                until getent hosts "$MASTER_ADDR" >/dev/null; do echo "waiting for $MASTER_ADDR"; sleep 2; done',
    `                exec torchrun --nnodes=${o.nodes} --nproc-per-node=${hw.gpus} --node-rank="$JOB_COMPLETION_INDEX" \\`,
    '                  --master-addr="$MASTER_ADDR" --master-port=29500 \\',
    `                  "\${CODE_DIR}/train.py" --total-steps ${o.totalSteps} --ckpt-every ${o.ckptEvery}`,
    '              ports:',
    '              - containerPort: 29500',
    '              env:',
    '              - name: JOBSET_NAME',
    '                valueFrom:',
    '                  fieldRef:',
    "                    fieldPath: metadata.labels['jobset.sigs.k8s.io/jobset-name']",
    '              # 노드 간 NCCL은 Pod 네트워크(eth0) TCP로 한다.',
    '              - name: NCCL_SOCKET_IFNAME',
    '                value: eth0',
    '              - name: NCCL_IB_DISABLE',
    '                value: "1"',
    '              resources:',
    '                requests:',
    `                  cpu: "${hw.cpu}"`,
    `                  memory: ${hw.memory}`,
    `                  nvidia.com/gpu: ${hw.gpus}`,
    '                limits:',
    `                  memory: ${hw.memory}`,
    `                  nvidia.com/gpu: ${hw.gpus}`,
  ];
  return lines.join('\n') + '\n';
}
