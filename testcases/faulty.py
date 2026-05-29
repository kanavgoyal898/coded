n = int(input())
nums = list(map(int, input().split()))
target = int(input())

nums.sort()
result = []

for i in range(n - 3):
    for j in range(i + 1, n - 2):
        left = j + 1
        right = n - 1

        while left < right:
            total = nums[i] + nums[j] + nums[left] + nums[right]

            if total == target:
                result.append(
                    [nums[i], nums[j], nums[left], nums[right]]
                )
                left += 1
                right -= 1

            elif total < target:
                left += 1
            else:
                right -= 1

for quad in result:
    print(*quad)